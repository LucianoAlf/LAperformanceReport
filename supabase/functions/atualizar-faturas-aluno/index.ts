/// <reference lib="deno.ns" />

// Botao "Atualizar faturas deste aluno" do caixa (LAPE-56).
//
// Busca GET /faturas?aluno_id=N no Emusys e grava so' em `emusys_faturas`
// (upsert por unidade_id + emusys_fatura_id). Nao abre rodada de sync, nao toca
// sync_run_items: ver o cabecalho de _shared/faturasDoAlunoSobDemanda.ts.
//
// Toda chamada — sucesso, nada novo ou falha — deixa carimbo em automacao_log
// (evento='faturas_aluno_sob_demanda'). Conferir a ultima:
//   select created_at, status, acao, detalhes from automacao_log
//    where evento = 'faturas_aluno_sob_demanda' order by id desc limit 20;

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { autorizarEquipe } from '../_shared/equipeAuthorization.ts';
import { EmusysHttpError, EmusysRateLimitError, type UnidadeSyncConfig } from '../_shared/faturasSync.ts';
import {
  coletarFaturasDoAluno,
  compararComEspelho,
  EmusysTimeoutError,
  RespostaInesperadaError,
} from '../_shared/faturasDoAlunoSobDemanda.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';
const EMUSYS_API = 'https://api.emusys.com.br/v1';
const PRAZO_EMUSYS_MS = 20_000;

// Mesmo mapa de sync-faturas-emusys (tokens por unidade). Chave = unidade_id.
const UNIDADES: Record<string, { codigo: string; config: () => UnidadeSyncConfig }> = {
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92': {
    codigo: 'cg',
    config: () => ({
      nome: 'Campo Grande',
      id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
      token: Deno.env.get('EMUSYS_TOKEN_CAMPO_GRANDE')?.trim() || Deno.env.get('EMUSYS_TOKEN_CG')?.trim() || '',
    }),
  },
  '95553e96-971b-4590-a6eb-0201d013c14d': {
    codigo: 'recreio',
    config: () => ({
      nome: 'Recreio',
      id: '95553e96-971b-4590-a6eb-0201d013c14d',
      token: Deno.env.get('EMUSYS_TOKEN_RECREIO')?.trim() || '',
    }),
  },
  '368d47f5-2d88-4475-bc14-ba084a9a348e': {
    codigo: 'barra',
    config: () => ({
      nome: 'Barra',
      id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
      token: Deno.env.get('EMUSYS_TOKEN_BARRA')?.trim() || '',
    }),
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type Carimbo = {
  status: 'ok' | 'warn' | 'erro';
  acao: string;
  alunoNome: string;
  unidadeNome: string | null;
  detalhes: Record<string, unknown>;
};

async function carimbar(c: Carimbo) {
  const { error } = await admin.from('automacao_log').insert({
    evento: 'faturas_aluno_sob_demanda',
    acao: c.acao,
    status: c.status,
    aluno_nome: c.alunoNome,
    unidade_nome: c.unidadeNome,
    detalhes: c.detalhes,
  });
  // Falha do carimbo nao derruba a resposta, mas nao some: fica no log da edge
  // com o identificador do aluno.
  if (error) {
    console.error(
      `[atualizar-faturas-aluno] carimbo falhou (${c.acao}, aluno ${String(c.detalhes.emusys_student_id)}):`,
      error.message,
    );
  }
}

/** Usuario comum so' atualiza aluno de unidade a que tem acesso (admin: qualquer). */
async function usuarioAlcancaUnidade(req: Request, unidadeId: string): Promise<boolean> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const comoUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: ehAdmin, error: erroAdmin } = await comoUsuario.rpc('is_admin');
  if (erroAdmin) throw new Error(`is_admin: ${erroAdmin.message}`);
  if (ehAdmin === true) return true;
  const { data: ids, error: erroIds } = await comoUsuario.rpc('get_user_unidade_ids');
  if (erroIds) throw new Error(`get_user_unidade_ids: ${erroIds.message}`);
  return ((ids ?? []) as unknown[]).map(String).includes(unidadeId);
}

async function quemChamou(req: Request): Promise<string | null> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || jwt === SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data.user?.email ?? data.user?.id ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, codigo: 'METODO', erro: 'metodo nao permitido' }, 405);

  const acesso = await autorizarEquipe(req, {
    syncAdminToken: SYNC_ADMIN_TOKEN,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    buscarUsuario: async (authUserId) => {
      const { data } = await admin.from('usuarios').select('perfil, ativo').eq('auth_user_id', authUserId).maybeSingle();
      return data;
    },
  });
  if (acesso.ok === false) return json({ ok: false, codigo: 'ACESSO', erro: acesso.erro }, acesso.status);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const unidadeId = String(body.unidade_id ?? '').trim();
  const emusysStudentId = String(body.emusys_student_id ?? '').trim();
  const alunoNome = String(body.aluno_nome ?? '').trim() || `emusys:${emusysStudentId || '?'}`;
  const unidade = UNIDADES[unidadeId];
  const base = { unidade_id: unidadeId, emusys_student_id: emusysStudentId, via: acesso.via };

  if (!unidade) {
    return json({ ok: false, codigo: 'UNIDADE', erro: 'unidade desconhecida' }, 400);
  }
  const config = unidade.config();
  if (!/^[1-9]\d*$/.test(emusysStudentId)) {
    await carimbar({ status: 'warn', acao: 'sem_id_emusys', alunoNome, unidadeNome: config.nome, detalhes: base });
    return json({ ok: false, codigo: 'SEM_ID_EMUSYS', erro: 'aluno sem vinculo com o Emusys' }, 400);
  }

  const solicitante = await quemChamou(req);
  const detalhesBase = { ...base, solicitante };

  if (acesso.via === 'usuario') {
    let alcanca = false;
    try {
      alcanca = await usuarioAlcancaUnidade(req, unidadeId);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      await carimbar({ status: 'erro', acao: 'falha_ao_checar_escopo', alunoNome, unidadeNome: config.nome, detalhes: { ...detalhesBase, erro: msg } });
      return json({ ok: false, codigo: 'ESCOPO', erro: `nao consegui conferir seu acesso a unidade: ${msg}` }, 500);
    }
    if (!alcanca) {
      await carimbar({ status: 'warn', acao: 'fora_do_escopo', alunoNome, unidadeNome: config.nome, detalhes: detalhesBase });
      return json({ ok: false, codigo: 'ESCOPO', erro: 'voce nao tem acesso a esta unidade' }, 403);
    }
  }

  if (!config.token) {
    await carimbar({ status: 'erro', acao: 'token_ausente', alunoNome, unidadeNome: config.nome, detalhes: detalhesBase });
    return json({ ok: false, codigo: 'CONFIG', erro: `token do Emusys de ${config.nome} nao configurado` }, 503);
  }

  const inicio = Date.now();
  let coletado: Awaited<ReturnType<typeof coletarFaturasDoAluno>>;
  try {
    coletado = await coletarFaturasDoAluno({
      apiBaseUrl: EMUSYS_API,
      unidadeCodigo: unidade.codigo,
      unidade: config,
      emusysStudentId,
      prazoMs: PRAZO_EMUSYS_MS,
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    const detalhes = { ...detalhesBase, erro: msg, duracao_ms: Date.now() - inicio };
    if (erro instanceof EmusysRateLimitError) {
      const retryAfterS = Math.ceil(erro.retryAfterMs / 1000);
      await carimbar({ status: 'warn', acao: 'emusys_limite', alunoNome, unidadeNome: config.nome, detalhes: { ...detalhes, retry_after_s: retryAfterS } });
      return json({ ok: false, codigo: 'EMUSYS_LIMITE', erro: 'o Emusys esta limitando as consultas agora', retry_after_s: retryAfterS }, 429);
    }
    if (erro instanceof EmusysTimeoutError) {
      await carimbar({ status: 'erro', acao: 'emusys_timeout', alunoNome, unidadeNome: config.nome, detalhes });
      return json({ ok: false, codigo: 'EMUSYS_TIMEOUT', erro: 'o Emusys nao respondeu a tempo' }, 504);
    }
    if (erro instanceof EmusysHttpError) {
      await carimbar({ status: 'erro', acao: 'emusys_erro_http', alunoNome, unidadeNome: config.nome, detalhes: { ...detalhes, http_status: erro.status } });
      return json({ ok: false, codigo: 'EMUSYS_ERRO', erro: `o Emusys respondeu com erro (HTTP ${erro.status})` }, 502);
    }
    const acao = erro instanceof RespostaInesperadaError ? 'emusys_resposta_inesperada' : 'falha_na_coleta';
    await carimbar({ status: 'erro', acao, alunoNome, unidadeNome: config.nome, detalhes });
    return json({ ok: false, codigo: 'EMUSYS_ERRO', erro: msg }, 502);
  }

  const ids = coletado.rows.map((r) => r.emusys_fatura_id);
  let comparacao = { novas: [] as typeof coletado.rows, alteradas: [] as typeof coletado.rows, iguais: 0 };
  if (ids.length > 0) {
    const { data: existentes, error: erroLeitura } = await admin
      .from('emusys_faturas')
      .select('emusys_fatura_id, status, valor_pago, valor_original, data_vencimento')
      .eq('unidade_id', unidadeId)
      .in('emusys_fatura_id', ids);
    if (erroLeitura) {
      await carimbar({ status: 'erro', acao: 'falha_ao_ler_espelho', alunoNome, unidadeNome: config.nome, detalhes: { ...detalhesBase, erro: erroLeitura.message } });
      return json({ ok: false, codigo: 'GRAVACAO_FALHOU', erro: `nao consegui ler o espelho: ${erroLeitura.message}` }, 500);
    }
    comparacao = compararComEspelho(coletado.rows, existentes ?? []);

    const { error: erroGravacao } = await admin
      .from('emusys_faturas')
      .upsert(coletado.rows.map((r) => ({ ...r, synced_at: new Date().toISOString() })), { onConflict: 'unidade_id,emusys_fatura_id' });
    if (erroGravacao) {
      await carimbar({
        status: 'erro',
        acao: 'falha_ao_gravar',
        alunoNome,
        unidadeNome: config.nome,
        detalhes: { ...detalhesBase, erro: erroGravacao.message, codigo_pg: erroGravacao.code, faturas: ids },
      });
      return json({ ok: false, codigo: 'GRAVACAO_FALHOU', erro: `nao consegui gravar as faturas: ${erroGravacao.message}` }, 500);
    }
  }

  const resumo = (r: (typeof coletado.rows)[number]) => ({
    emusys_fatura_id: r.emusys_fatura_id,
    descricao: r.descricao,
    competencia: r.competencia,
    data_vencimento: r.data_vencimento,
    status: r.status,
    valor_original: r.valor_original,
    valor_pago: r.valor_pago,
  });
  const resultado = {
    total_emusys: coletado.rows.length,
    novas: comparacao.novas.length,
    alteradas: comparacao.alteradas.length,
    iguais: comparacao.iguais,
    paginas: coletado.paginas,
    duracao_ms: Date.now() - inicio,
  };
  await carimbar({
    status: 'ok',
    acao: comparacao.novas.length + comparacao.alteradas.length > 0 ? 'atualizou' : 'nada_novo',
    alunoNome,
    unidadeNome: config.nome,
    detalhes: {
      ...detalhesBase,
      ...resultado,
      novas_ids: comparacao.novas.map((r) => r.emusys_fatura_id),
      alteradas_ids: comparacao.alteradas.map((r) => r.emusys_fatura_id),
    },
  });

  return json({
    ok: true,
    ...resultado,
    faturas_novas: comparacao.novas.map(resumo),
    faturas_alteradas: comparacao.alteradas.map(resumo),
  });
});
