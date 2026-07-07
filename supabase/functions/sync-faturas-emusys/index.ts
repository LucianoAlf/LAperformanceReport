/// <reference lib="deno.ns" />

// Edge Function: sync-faturas-emusys
// Sincroniza GET /faturas do Emusys para a camada financeira canonica dos
// relatorios mensais. Nao altera dados_mensais nem alunos; apenas cacheia
// faturas/parcelas por competencia para auditoria e calculo financeiro.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EMAILS_SYNC_TECNICO = new Set(
  (Deno.env.get('SYNC_FATURAS_ALLOWED_EMAILS')
    ?? Deno.env.get('SYNC_MATRICULAS_ALLOWED_EMAILS')
    ?? 'lucianoalf.la@gmail.com,hugo@lamusic.com.br')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_FATURAS_ADMIN_TOKEN')?.trim()
  || Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim()
  || '';

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
};

const UNIDADES: Record<string, { nome: string; id: string; token: string }> = {
  cg: {
    nome: 'Campo Grande',
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    token: Deno.env.get('EMUSYS_TOKEN_CAMPO_GRANDE')?.trim() || requiredEnv('EMUSYS_TOKEN_CG'),
  },
  recreio: {
    nome: 'Recreio',
    id: '95553e96-971b-4590-a6eb-0201d013c14d',
    token: requiredEnv('EMUSYS_TOKEN_RECREIO'),
  },
  barra: {
    nome: 'Barra',
    id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    token: requiredEnv('EMUSYS_TOKEN_BARRA'),
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type UnidadeConfig = typeof UNIDADES[string];

type FaturaEmusys = {
  id?: number | string | null;
  matricula_id?: number | string | null;
  contrato_id?: number | string | null;
  aluno_id?: number | string | null;
  descricao?: string | null;
  status?: string | null;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  valor_original?: number | string | null;
  valor_pago?: number | string | null;
  juros_e_multa?: number | string | null;
  desconto_aplicado?: number | string | null;
  desconto_fixo?: number | string | null;
  desconto_condicional?: number | string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function validarAcessoSync(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return json({ erro: 'sync restrito a usuarios tecnicos' }, 403);
  }

  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase() || '';

  if (error || !email || !EMAILS_SYNC_TECNICO.has(email)) {
    return json({ erro: 'sync restrito a usuarios tecnicos' }, 403);
  }

  return null;
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bigintOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanStatus(value: unknown): string {
  const status = String(value ?? '').trim().toLowerCase();
  if (status === 'aberta' || status === 'paga' || status === 'cancelada') return status;
  return status || 'desconhecido';
}

function cleanDate(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (!s || s === '0000-00-00') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function competenciaFromVencimento(dataVencimento: string): string {
  return `${dataVencimento.slice(0, 7)}-01`;
}

function isParcela(row: FaturaEmusys): boolean {
  return /^\s*parcela\b/i.test(String(row.descricao ?? ''));
}

async function buscarFaturas(unidade: UnidadeConfig, ano: number, mes: number) {
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}`;
  const items: FaturaEmusys[] = [];
  let cursor = '';
  let paginas = 0;

  while (true) {
    const params = new URLSearchParams({
      status: 'todas',
      data_vencimento_inicial: dataInicio,
      data_vencimento_final: dataFim,
      limite: '50',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${EMUSYS_API}/faturas?${params.toString()}`, {
      headers: { token: unidade.token },
    });

    if (!res.ok) {
      throw new Error(`Emusys /faturas ${unidade.nome}: HTTP ${res.status} - ${await res.text()}`);
    }

    const payload = await res.json();
    const pageItems = Array.isArray(payload.items)
      ? payload.items
      : (Array.isArray(payload.dados) ? payload.dados : []);

    items.push(...pageItems);
    paginas += 1;

    cursor = payload.paginacao?.proximo_cursor || payload.proximo_cursor || '';
    if (!cursor) break;
    if (paginas > 100) throw new Error(`Emusys /faturas ${unidade.nome}: paginacao excedeu limite de seguranca`);
    await sleep(150);
  }

  return { items, paginas };
}

function mapFatura(row: FaturaEmusys, unidadeCodigo: string, unidade: UnidadeConfig) {
  const dataVencimento = cleanDate(row.data_vencimento);
  if (!dataVencimento) return null;

  return {
    unidade_id: unidade.id,
    unidade_codigo: unidadeCodigo,
    emusys_fatura_id: bigintOrNull(row.id),
    emusys_matricula_id: bigintOrNull(row.matricula_id),
    emusys_contrato_id: bigintOrNull(row.contrato_id),
    emusys_student_id: bigintOrNull(row.aluno_id),
    descricao: String(row.descricao ?? '').trim(),
    status: cleanStatus(row.status),
    data_vencimento: dataVencimento,
    data_pagamento: cleanDate(row.data_pagamento),
    competencia: competenciaFromVencimento(dataVencimento),
    valor_original: n(row.valor_original),
    valor_pago: row.valor_pago == null || String(row.valor_pago).trim() === '' ? null : n(row.valor_pago),
    juros_e_multa: n(row.juros_e_multa),
    desconto_aplicado: n(row.desconto_aplicado),
    desconto_fixo: n(row.desconto_fixo),
    desconto_condicional: n(row.desconto_condicional),
    payload: row,
    synced_at: new Date().toISOString(),
  };
}

async function syncUnidade(supabase: ReturnType<typeof createClient>, unidadeCodigo: string, ano: number, mes: number) {
  const unidade = UNIDADES[unidadeCodigo];
  if (!unidade) throw new Error(`Unidade invalida: ${unidadeCodigo}`);

  const { items, paginas } = await buscarFaturas(unidade, ano, mes);
  const rows = items
    .map((row) => mapFatura(row, unidadeCodigo, unidade))
    .filter((row): row is NonNullable<ReturnType<typeof mapFatura>> => Boolean(row?.emusys_fatura_id));

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase
      .from('emusys_faturas')
      .upsert(chunk, { onConflict: 'unidade_id,emusys_fatura_id' });
    if (error) throw error;
  }

  const parcelas = rows.filter((row) => isParcela(row));
  const totalRecebidoParcelas = parcelas.reduce((acc, row) => (
    row.status === 'paga' ? acc + n(row.valor_pago) : acc
  ), 0);
  const totalPrevistoParcelas = parcelas.reduce((acc, row) => (
    acc + (row.status === 'paga'
      ? n(row.valor_pago)
      : n(row.valor_original) + n(row.juros_e_multa) - n(row.desconto_aplicado))
  ), 0);

  return {
    unidade: unidade.nome,
    unidade_codigo: unidadeCodigo,
    paginas,
    recebidas_api: items.length,
    upserts: rows.length,
    parcelas: parcelas.length,
    parcelas_pagas: parcelas.filter((row) => row.status === 'paga').length,
    parcelas_abertas: parcelas.filter((row) => row.status !== 'paga').length,
    total_recebido_parcelas: Number(totalRecebidoParcelas.toFixed(2)),
    faturamento_previsto_parcelas: Number(totalPrevistoParcelas.toFixed(2)),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const acessoNegado = await validarAcessoSync(req);
    if (acessoNegado) return acessoNegado;

    const url = new URL(req.url);
    const body = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {};

    const ano = Number(url.searchParams.get('ano') || body.ano || new Date().getFullYear());
    const mes = Number(url.searchParams.get('mes') || body.mes || new Date().getMonth() + 1);
    const unidadeParam = String(url.searchParams.get('u') || body.unidade || 'todos').toLowerCase();

    if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) {
      return json({ erro: 'ano invalido' }, 400);
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return json({ erro: 'mes invalido' }, 400);
    }

    const codigos = unidadeParam === 'todos'
      ? Object.keys(UNIDADES)
      : [unidadeParam === 'campo_grande' ? 'cg' : unidadeParam];

    for (const codigo of codigos) {
      if (!UNIDADES[codigo]) return json({ erro: `unidade invalida: ${codigo}` }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resultados = [];
    for (const codigo of codigos) {
      resultados.push(await syncUnidade(supabase, codigo, ano, mes));
    }

    return json({
      ok: true,
      ano,
      mes,
      resultados,
    });
  } catch (error) {
    console.error('[sync-faturas-emusys] erro', error);
    return json({ ok: false, erro: error instanceof Error ? error.message : String(error) }, 500);
  }
});
