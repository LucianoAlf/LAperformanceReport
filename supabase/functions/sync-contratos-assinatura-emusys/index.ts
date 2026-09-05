/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizarMatriculaContrato } from '../_shared/contrato-assinatura.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() ?? '';
const EMUSYS_API = 'https://api.emusys.com.br/v1';

const UNIDADES: Record<string, { id: string; tokenEnv: string }> = {
  cg: { id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', tokenEnv: 'EMUSYS_TOKEN_CG' },
  recreio: { id: '95553e96-971b-4590-a6eb-0201d013c14d', tokenEnv: 'EMUSYS_TOKEN_RECREIO' },
  barra: { id: '368d47f5-2d88-4475-bc14-ba084a9a348e', tokenEnv: 'EMUSYS_TOKEN_BARRA' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-sync-token',
};

const MAX_PAGES = 40;
const MAX_RETRIES_429 = 4;
const RATE_LIMIT_DELAY_MS = 1_100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function dataBrt(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function mensagemErro(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function validarAcesso(req: Request): Promise<boolean> {
  const syncToken = req.headers.get('x-sync-token')?.trim() ?? '';
  if (SYNC_ADMIN_TOKEN && syncToken === SYNC_ADMIN_TOKEN) return true;

  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return Boolean(bearer && bearer === SUPABASE_SERVICE_ROLE_KEY);
}

async function fetchPagina(url: URL): Promise<Response> {
  for (let tentativa = 0; tentativa <= MAX_RETRIES_429; tentativa += 1) {
    let response: Response;
    try {
      response = await fetch(url);
    } catch (error) {
      if (tentativa === MAX_RETRIES_429) throw error;
      await sleep(Math.min(2_000 * (2 ** tentativa), 20_000));
      continue;
    }

    if (response.status !== 429) return response;
    if (tentativa === MAX_RETRIES_429) {
      throw new Error(`Emusys respondeu 429 apos ${tentativa + 1} tentativas`);
    }
    const retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1_000;
    await sleep(Math.min(Math.max(retryAfter, 2_000 * (2 ** tentativa)), 30_000));
  }
  throw new Error('Retry do Emusys esgotado');
}

async function buscarTodasMatriculasAtivas(token: string): Promise<{ items: Record<string, unknown>[]; paginas: number }> {
  const items: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  let cursor: string | null = null;

  for (let pagina = 1; pagina <= MAX_PAGES; pagina += 1) {
    const url = new URL(`${EMUSYS_API}/matriculas`);
    url.searchParams.set('status', 'ativa');
    url.searchParams.set('limite', '50');
    url.searchParams.set('token', token);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetchPagina(url);
    if (!response.ok) throw new Error(`Emusys respondeu HTTP ${response.status}`);
    const body = await response.json() as {
      items?: unknown;
      paginacao?: { tem_mais?: boolean; proximo_cursor?: string | null };
    };
    if (!Array.isArray(body.items)) throw new Error(`Pagina ${pagina} sem items validos`);

    for (const raw of body.items) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`Pagina ${pagina} contem matricula invalida`);
      }
      const item = raw as Record<string, unknown>;
      const id = String(item.id ?? '').trim();
      if (ids.has(id)) throw new Error(`Matricula duplicada na fotografia: ${id || 'sem_id'}`);
      ids.add(id);
      items.push(item);
    }

    if (!body.paginacao?.tem_mais) return { items, paginas: pagina };
    cursor = body.paginacao?.proximo_cursor?.trim() || null;
    if (!cursor) throw new Error(`Pagina ${pagina} indica tem_mais sem proximo_cursor`);
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  throw new Error(`Paginacao excedeu MAX_PAGES=${MAX_PAGES}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ erro: 'metodo_nao_permitido' }, 405);
  if (!(await validarAcesso(req))) return jsonResponse({ erro: 'nao_autorizado' }, 403);

  const slug = new URL(req.url).searchParams.get('u')?.trim().toLowerCase() ?? '';
  const unidade = UNIDADES[slug];
  if (!unidade) return jsonResponse({ erro: 'unidade_invalida' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ultimoSucesso, error: ultimoSucessoError } = await supabase
    .from('contrato_assinatura_sync_execucoes')
    .select('completed_at')
    .eq('unidade_id', unidade.id)
    .eq('status', 'succeeded')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ultimoSucessoError) return jsonResponse({ erro: 'falha_ao_ler_frescor', unidade: slug }, 500);
  if (ultimoSucesso?.completed_at && dataBrt(ultimoSucesso.completed_at) === dataBrt(new Date())) {
    return jsonResponse({ status: 'skipped_fresh', unidade: slug, reconciliado_em: ultimoSucesso.completed_at });
  }

  const { data: execucao, error: execucaoError } = await supabase
    .from('contrato_assinatura_sync_execucoes')
    .insert({ unidade_id: unidade.id, unidade_slug: slug, status: 'running' })
    .select('id')
    .single();
  if (execucaoError || !execucao?.id) {
    console.error('contrato_assinatura: nao foi possivel abrir execucao', mensagemErro(execucaoError));
    return jsonResponse({ erro: 'falha_ao_abrir_execucao', unidade: slug }, 500);
  }

  try {
    const token = Deno.env.get(unidade.tokenEnv)?.trim();
    if (!token) throw new Error(`Secret obrigatorio ausente: ${unidade.tokenEnv}`);
    const fotografia = await buscarTodasMatriculasAtivas(token);
    const observacoes = fotografia.items.map((item) => normalizarMatriculaContrato(item, unidade.id));
    const observadoEm = new Date().toISOString();

    const { error: paginasError } = await supabase
      .from('contrato_assinatura_sync_execucoes')
      .update({ paginas: fotografia.paginas })
      .eq('id', execucao.id)
      .eq('status', 'running');
    if (paginasError) throw paginasError;

    const { data: resumo, error: loteError } = await supabase
      .rpc('registrar_contrato_assinatura_lote_v1', {
        p_execucao_id: execucao.id,
        p_unidade_id: unidade.id,
        p_observado_em: observadoEm,
        p_linhas: observacoes,
      });
    if (loteError) throw loteError;

    return jsonResponse({ status: 'succeeded', unidade: slug, paginas: fotografia.paginas, ...resumo });
  } catch (error) {
    const erro = mensagemErro(error);
    const { error: logError } = await supabase
      .from('contrato_assinatura_sync_execucoes')
      .update({ status: 'failed', erro, completed_at: new Date().toISOString() })
      .eq('id', execucao.id)
      .eq('status', 'running');
    if (logError) console.error('contrato_assinatura: falha ao registrar erro', mensagemErro(logError));
    console.error('contrato_assinatura: execucao falhou', { unidade: slug, execucao_id: execucao.id, erro });
    return jsonResponse({ status: 'failed', unidade: slug, execucao_id: execucao.id, erro }, 502);
  }
});
