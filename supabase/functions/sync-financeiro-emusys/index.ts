/// <reference lib="deno.ns" />

// Espelho dos endpoints financeiros beta do Emusys (decisão Alf 2026-09-14):
// o LA Report guarda o espelho; o Super Folha consome; a Maria lê só de lá.
//
// - Catálogos completos a cada rodada: /financeiro/contas_financeiras,
//   /financeiro/plano_contas, /financeiro/formas_pagamento.
//   ⚠️ CG retorna HTTP 500 "erro desconhecido" em contas_financeiras desde
//   14/09/2026 — bug da origem: registramos e seguimos; NUNCA apaga o que havia.
// - Lançamentos revarridos DIA A DIA (fonte não tem updated_em). Rotina diária:
//   os 10 dias encerrados mais recentes, mesmo se já estavam completos.
//   Erro nunca grava dia como vazio: o dia fica 'erro'/pendente.
// - Item vivo que some numa varredura completa do dia → sumiu_em. Nada é apagado.
// - ~1,1 s entre chamadas. HTTP 429 sai imediatamente para a fila durável;
//   não há espera longa dentro da Edge Function.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  dividirJanela,
  extrairCodigoPlano,
  janelaRevarreduraSemanal,
  janelaRotinaDiaria,
  mapearLancamento,
  resumoJanela,
  sha256,
  validarJanelaEncerrada,
  type LancamentoEmusys,
} from '../_shared/financeiroEmusys.ts';
import {
  criarErroHttpFinanceiroEmusys,
  EmusysFinanceiroHttpError,
} from '../_shared/financeiroEmusysHttp.ts';

const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_FATURAS_ADMIN_TOKEN')?.trim()
  || Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim()
  || '';
// Segunda credencial, para o orquestrador local do backfill: o gateway
// (verify_jwt=true) já validou a assinatura; aqui dentro basta conferir que o
// JWT é o service_role DESTE projeto. (O env SUPABASE_SERVICE_ROLE_KEY hoje vem
// no formato sb_secret, que não dá para comparar com o JWT legado por igualdade.)
const jwtEhServiceRoleDesteProjeto = (authorization: string): boolean => {
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.ref === 'ouqwbbermlzqqvtqwlul' && payload.role === 'service_role';
  } catch {
    return false;
  }
};
const API_BASE = (Deno.env.get('EMUSYS_API_BASE_URL') ?? 'https://api.emusys.com.br/v1').replace(/\/$/, '');

interface UnidadeConfig { codigo: string; nome: string; id: string; token: string }
const UNIDADES: UnidadeConfig[] = [
  {
    codigo: 'cg', nome: 'Campo Grande',
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    token: Deno.env.get('EMUSYS_TOKEN_CAMPO_GRANDE')?.trim() || Deno.env.get('EMUSYS_TOKEN_CG')?.trim() || '',
  },
  {
    codigo: 'barra', nome: 'Barra',
    id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    token: Deno.env.get('EMUSYS_TOKEN_BARRA')?.trim() || '',
  },
  {
    codigo: 'recreio', nome: 'Recreio',
    id: '95553e96-971b-4590-a6eb-0201d013c14d',
    token: Deno.env.get('EMUSYS_TOKEN_RECREIO')?.trim() || '',
  },
];

const PAUSA_MS = 1100;
const FETCH_TIMEOUT_MS = 30000;
const ORCAMENTO_PADRAO_SEGUNDOS = 100;
const PAGE_SIZE = 50;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hojeBrt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

let ultimaChamadaEm = 0;
async function buscarJsonPaginado(
  unidade: UnidadeConfig,
  caminho: string,
  params: Record<string, string>,
) {
  const itens: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  let cursor = '';
  let listaVista = false;
  while (true) {
    const url = new URL(`${API_BASE}${caminho}`);
    for (const [chave, valor] of Object.entries(params)) url.searchParams.set(chave, valor);
    url.searchParams.set('limite', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('cursor', cursor);

    const agora = Date.now();
    if (agora - ultimaChamadaEm < PAUSA_MS) await espera(PAUSA_MS - (agora - ultimaChamadaEm));
    ultimaChamadaEm = Date.now();
    const http = await fetch(url, {
      headers: { token: unidade.token },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!http.ok) {
      const texto = (await http.text()).slice(0, 200).trim();
      throw criarErroHttpFinanceiroEmusys({
        status: http.status,
        caminho,
        unidade: unidade.codigo,
        retryAfter: http.headers.get('retry-after'),
        detalhe: texto,
      });
    }
    const resposta = await http.json() as Record<string, unknown>;

    const pagina = Array.isArray(resposta.items) ? resposta.items as Record<string, unknown>[] : null;
    if (!pagina) {
      // catálogos não são paginados: devolve a raiz inteira
      if (!listaVista) return resposta;
      throw new Error(`resposta sem items em ${caminho}`);
    }
    listaVista = true;
    itens.push(...pagina);
    const proximo = String((resposta.paginacao as Record<string, unknown> | undefined)?.proximo_cursor ?? '').trim();
    const temMais = (resposta.paginacao as Record<string, unknown> | undefined)?.tem_mais === true;
    if (!temMais) return { items: itens };
    if (!proximo || vistos.has(proximo)) throw new Error(`paginacao inconsistente em ${caminho}`);
    vistos.add(proximo);
    cursor = proximo;
    if (vistos.size > 200) throw new Error(`paginacao excedeu guarda de seguranca em ${caminho}`);
  }
}

// ── upsert com tracking por item ─────────────────────────────────────────────

interface LinhaEspelho {
  emusys_lancamento_id: number;
  hash_conteudo: string;
  alterado_em: string | null;
  primeira_vez_visto: string;
  ultima_vez_visto: string;
  [chave: string]: unknown;
}

async function carregarExistentes(client: SupabaseClient, unidadeId: string, ids: number[]) {
  const mapa = new Map<number, { hash_conteudo: string; alterado_em: string | null; primeira_vez_visto: string }>();
  for (let ini = 0; ini < ids.length; ini += 300) {
    const { data: rows, error } = await client
      .from('financeiro_emusys_lancamentos')
      .select('emusys_lancamento_id,hash_conteudo,alterado_em,primeira_vez_visto')
      .eq('unidade_id', unidadeId)
      .in('emusys_lancamento_id', ids.slice(ini, ini + 300));
    if (error) throw error;
    for (const row of rows ?? []) {
      mapa.set(Number(row.emusys_lancamento_id), row as never);
    }
  }
  return mapa;
}

async function gravarDia(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  data: string,
  itens: Record<string, unknown>[],
  garantirLease?: () => Promise<void>,
) {
  const agora = new Date().toISOString();

  const mapeados: Awaited<ReturnType<typeof mapearLancamento>>[] = [];
  for (const cru of itens) {
    mapeados.push(await mapearLancamento(cru as unknown as LancamentoEmusys, unidade.id));
  }
  const existentes = await carregarExistentes(client, unidade.id, mapeados.map((m) => m.emusys_lancamento_id));

  const linhas: LinhaEspelho[] = [];
  for (const mapeado of mapeados) {
    const anterior = existentes.get(mapeado.emusys_lancamento_id);
    linhas.push({
      ...mapeado,
      primeira_vez_visto: anterior?.primeira_vez_visto ?? agora,
      ultima_vez_visto: agora,
      alterado_em: anterior && anterior.hash_conteudo !== mapeado.hash_conteudo ? agora : (anterior?.alterado_em ?? null),
      // item voltou a aparecer na varredura completa do dia → perde a marca de morte
      sumiu_em: null,
    });
  }

  for (let ini = 0; ini < linhas.length; ini += 200) {
    await garantirLease?.();
    const { error } = await client
      .from('financeiro_emusys_lancamentos')
      .upsert(linhas.slice(ini, ini + 200), { onConflict: 'unidade_id,emusys_lancamento_id' });
    if (error) throw error;
  }

  // dia SEM nenhum item também é resposta completa da origem — aplicar sumiu_em
  await garantirLease?.();
  const vistos = itens.length ? `(${itens.map((i) => String(Number(i.id))).join(',')})` : null;
  let morteQuery = client
    .from('financeiro_emusys_lancamentos')
    .update({ sumiu_em: agora })
    .eq('unidade_id', unidade.id)
    .eq('data', data)
    .is('sumiu_em', null);
  if (vistos) morteQuery = morteQuery.not('emusys_lancamento_id', 'in', vistos);
  const { error: erroMorte } = await morteQuery;
  if (erroMorte) throw erroMorte;
}

async function gravarStatusDia(
  client: SupabaseClient,
  unidadeId: string,
  data: string,
  registro: { status: 'completo' | 'erro'; itens: number; ultimo_erro?: string | null; tentativas: number; iniciado_em: string },
) {
  const agora = new Date().toISOString();
  const { error } = await client
    .from('financeiro_emusys_varredura_dias')
    .upsert({
      unidade_id: unidadeId,
      data,
      status: registro.status,
      itens: registro.itens,
      tentativas: registro.tentativas,
      ultimo_erro: registro.ultimo_erro ?? null,
      iniciado_em: registro.iniciado_em,
      concluido_em: registro.status === 'completo' ? agora : null,
      ultima_tentativa_em: agora,
    }, { onConflict: 'unidade_id,data' });
  if (error) throw error;
}

// ── catálogos ────────────────────────────────────────────────────────────────

async function sincronizarCatalogo(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  caminho: string,
  tabela: string,
  chaveRaiz: string,
  mapear: (cru: Record<string, unknown>) => Promise<Record<string, unknown>>,
  colunaIdApi: string,
  garantirLease?: () => Promise<void>,
) {
  const resposta = await buscarJsonPaginado(unidade, caminho, {});
  const lista = Array.isArray((resposta as Record<string, unknown>)[chaveRaiz])
    ? (resposta as Record<string, unknown>)[chaveRaiz] as Record<string, unknown>[]
    : null;
  if (!lista) throw new Error(`resposta inesperada em ${caminho}: sem ${chaveRaiz}`);
  await garantirLease?.();

  const agora = new Date().toISOString();
  // deno-lint-ignore no-explicit-any
  const consulta = client.from(tabela)
    .select(`${colunaIdApi},hash_conteudo,alterado_em,primeira_vez_visto`)
    .eq('unidade_id', unidade.id) as any;
  const { data: existentes, error } = await consulta;
  if (error) throw error;
  const mapa = new Map<number, { hash_conteudo: string; alterado_em: string | null; primeira_vez_visto: string }>(
    (existentes ?? []).map((row: Record<string, unknown>) => [Number(row[colunaIdApi]), row as never]),
  );

  const linhas: Record<string, unknown>[] = [];
  for (const cru of lista) {
    const base = await mapear(cru);
    const idApi = Number(base[colunaIdApi]);
    if (!Number.isSafeInteger(idApi)) throw new Error(`id de catalogo invalido em ${tabela}: ${String(base[colunaIdApi])}`);
    const hash = await sha256(base);
    const anterior = mapa.get(idApi);
    linhas.push({
      ...base,
      unidade_id: unidade.id,
      hash_conteudo: hash,
      payload: cru,
      primeira_vez_visto: anterior?.primeira_vez_visto ?? agora,
      ultima_vez_visto: agora,
      alterado_em: anterior && anterior.hash_conteudo !== hash ? agora : (anterior?.alterado_em ?? null),
      sumiu_em: null,
    });
  }

  for (let ini = 0; ini < linhas.length; ini += 200) {
    await garantirLease?.();
    const { error: erroUpsert } = await client
      .from(tabela)
      .upsert(linhas.slice(ini, ini + 200), { onConflict: `unidade_id,${colunaIdApi}` });
    if (erroUpsert) throw erroUpsert;
  }
  await garantirLease?.();
  const vistos = linhas.length ? `(${linhas.map((l) => String(l[colunaIdApi])).join(',')})` : null;
  let morte = client.from(tabela).update({ sumiu_em: agora }).eq('unidade_id', unidade.id).is('sumiu_em', null);
  if (vistos) morte = morte.not(colunaIdApi, 'in', vistos);
  const { error: erroMorte } = await morte;
  if (erroMorte) throw erroMorte;
  return linhas.length;
}

// ── orquestração da unidade ──────────────────────────────────────────────────

type ModoResumo = 'diario' | 'manutencao';

async function registrarErroResumo(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  janela: { inicio: string; fim: string },
  mensagem: string,
  diasPendentes: number,
  modoResumo: ModoResumo,
  erroOriginal?: unknown,
) {
  const agora = new Date().toISOString();
  const { data: anterior, error: erroAnterior } = await client
    .from('financeiro_emusys_varredura_resumo')
    .select('janela_inicio,janela_fim,ultima_varredura_completa_em,ultima_revarredura_anual_em,dias_pendentes,catalogos_erro')
    .eq('unidade_id', unidade.id)
    .maybeSingle();
  if (erroAnterior) throw erroAnterior;

  const registro: Record<string, unknown> = {
    unidade_id: unidade.id,
    janela_inicio: modoResumo === 'diario' ? janela.inicio : (anterior?.janela_inicio ?? janela.inicio),
    janela_fim: modoResumo === 'diario' ? janela.fim : (anterior?.janela_fim ?? janela.fim),
    ultima_tentativa_em: agora,
    dias_pendentes: modoResumo === 'diario' ? diasPendentes : (anterior?.dias_pendentes ?? diasPendentes),
    ultimo_erro: mensagem.slice(0, 400),
    ultima_varredura_completa_em: anterior?.ultima_varredura_completa_em ?? null,
    ultima_revarredura_anual_em: anterior?.ultima_revarredura_anual_em ?? null,
    atualizado_em: agora,
  };
  const chaveCatalogo = erroOriginal instanceof EmusysFinanceiroHttpError
    ? ({
      '/financeiro/contas_financeiras': 'contas',
      '/financeiro/plano_contas': 'plano_contas',
      '/financeiro/formas_pagamento': 'formas_pagamento',
    } as Record<string, string>)[erroOriginal.caminho]
    : null;
  registro.catalogos_erro = chaveCatalogo
    ? {
      ...((anterior?.catalogos_erro as Record<string, unknown> | null) ?? {}),
      [chaveCatalogo]: { erro: mensagem.slice(0, 400) },
    }
    : (anterior?.catalogos_erro ?? null);
  const { error } = await client
    .from('financeiro_emusys_varredura_resumo')
    .upsert(registro, { onConflict: 'unidade_id' });
  if (error) throw error;
}

async function processarUnidade(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  janela: { inicio: string; fim: string },
  comCatalogos: boolean,
  orcamentoMs: number,
  comecouEm: number,
  modoResumo: ModoResumo,
  tentativaNumero = 1,
  garantirLease?: () => Promise<void>,
) {
  if (!unidade.token) throw new Error(`token Emusys ausente para ${unidade.codigo}`);
  const resultado: Record<string, unknown> = { unidade: unidade.codigo, catalogos: {} as Record<string, unknown> };
  const catalogos = resultado.catalogos as Record<string, unknown>;

  const capturarErroCatalogo = (chave: string, erro: unknown) => {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    if (/SYNC_FINANCEIRO_EMUSYS_LEASE_PERDIDO/i.test(mensagem)) throw erro;
    if (erro instanceof EmusysFinanceiroHttpError && erro.codigo === 'EMUSYS_HTTP_429') {
      throw erro;
    }
    catalogos[chave] = { erro: mensagem };
    console.error(`[sync-financeiro] catalogo ${chave} ${unidade.codigo}:`, erro);
  };

  if (comCatalogos) {
    try {
      catalogos.contas = await sincronizarCatalogo(
        client, unidade, '/financeiro/contas_financeiras', 'financeiro_emusys_contas', 'contas_financeiras',
        (cru) => Promise.resolve({
          emusys_conta_id: Number(cru.id), descricao: cru.descricao ?? null,
          tipo: cru.tipo ?? null, banco: cru.banco ?? null, status: cru.status ?? null,
        }),
        'emusys_conta_id',
        garantirLease,
      );
    } catch (erro) {
      capturarErroCatalogo('contas', erro);
    }
    try {
      catalogos.plano_contas = await sincronizarCatalogo(
        client, unidade, '/financeiro/plano_contas', 'financeiro_emusys_plano_contas', 'plano_contas',
        (cru) => Promise.resolve({
          emusys_plano_id: Number(cru.id), nome: cru.nome ?? null, codigo_api: cru.codigo ?? null,
          codigo_extraido: extrairCodigoPlano(cru.nome), id_pai: cru.id_pai == null ? null : Number(cru.id_pai),
          tipo: cru.tipo ?? null, natureza: cru.natureza ?? null, status: cru.status ?? null,
        }),
        'emusys_plano_id',
        garantirLease,
      );
    } catch (erro) {
      capturarErroCatalogo('plano_contas', erro);
    }
    try {
      catalogos.formas_pagamento = await sincronizarCatalogo(
        client, unidade, '/financeiro/formas_pagamento', 'financeiro_emusys_formas_pagamento', 'formas_pagamento',
        (cru) => Promise.resolve({
          emusys_forma_id: Number(cru.id), descricao: cru.descricao ?? null,
          id_pai: cru.id_pai == null ? null : Number(cru.id_pai), generico: cru.generico ?? null,
        }),
        'emusys_forma_id',
        garantirLease,
      );
    } catch (erro) {
      capturarErroCatalogo('formas_pagamento', erro);
    }
  }

  const diasJanela = resumoJanela(janela.inicio, janela.fim);
  let diasProcessados = 0;
  for (let indice = 0; indice < diasJanela.length; indice += 1) {
    const dia = diasJanela[indice];
    if (Date.now() - comecouEm >= orcamentoMs) {
      throw new Error(`SYNC_ORCAMENTO_EXCEDIDO: ${unidade.codigo} ${dia}`);
    }
    const iniciou = new Date().toISOString();
    try {
      const coletado = await buscarJsonPaginado(unidade, '/financeiro/lancamentos', {
        data_inicial: dia,
        data_final: dia,
      });
      await garantirLease?.();
      const itens = ((coletado as Record<string, unknown>).items ?? []) as Record<string, unknown>[];
      await gravarDia(client, unidade, dia, itens, garantirLease);
      await garantirLease?.();
      await gravarStatusDia(client, unidade.id, dia, {
        status: 'completo', itens: itens.length, tentativas: tentativaNumero, iniciado_em: iniciou,
      });
      diasProcessados += 1;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await garantirLease?.();
      await gravarStatusDia(client, unidade.id, dia, {
        status: 'erro', itens: 0, ultimo_erro: mensagem.slice(0, 400),
        tentativas: tentativaNumero, iniciado_em: iniciou,
      });
      console.error(`[sync-financeiro] dia ${dia} ${unidade.codigo}:`, erro);
      throw erro;
    }
  }

  const agora = new Date().toISOString();
  await garantirLease?.();
  if (modoResumo === 'diario') {
    const { data: anterior, error: erroAnterior } = await client
      .from('financeiro_emusys_varredura_resumo')
      .select('ultima_revarredura_anual_em')
      .eq('unidade_id', unidade.id)
      .maybeSingle();
    if (erroAnterior) throw erroAnterior;
    const registro: Record<string, unknown> = {
      unidade_id: unidade.id,
      janela_inicio: janela.inicio,
      janela_fim: janela.fim,
      ultima_tentativa_em: agora,
      dias_pendentes: 0,
      ultimo_erro: null,
      ultima_varredura_completa_em: agora,
      ultima_revarredura_anual_em: anterior?.ultima_revarredura_anual_em ?? null,
      atualizado_em: agora,
    };
    if (comCatalogos) {
      registro.catalogos_erro = Object.fromEntries(
        Object.entries(catalogos).filter(([, valor]) =>
          typeof valor === 'object' && valor !== null && 'erro' in (valor as object)
        ),
      );
    }
    await garantirLease?.();
    const { error } = await client
      .from('financeiro_emusys_varredura_resumo')
      .upsert(registro, { onConflict: 'unidade_id' });
    if (error) throw error;
  }

  resultado.dias_processados = diasProcessados;
  resultado.dias_pendentes = 0;
  resultado.janela_completa = true;
  return resultado;
}

type QueueJob = {
  id: string;
  unidade_codigo: string;
  data_inicial: string;
  data_final: string;
  catalogos: boolean;
  trigger_source: string;
  attempt_count: number;
  max_retries: number;
};

type QueueResult = {
  status?: 'pending' | 'running' | 'retry_wait' | 'succeeded' | 'failed';
  next_attempt_at?: string | null;
  [key: string]: unknown;
};

async function rpcOrThrow<T>(
  client: SupabaseClient,
  nome: string,
  parametros: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(nome, parametros);
  if (error) throw error;
  return data as T;
}

const rpcFilaFinanceiroAusente = (erro: unknown): boolean => {
  const codigo = erro && typeof erro === 'object' && 'code' in erro ? String(erro.code) : '';
  const mensagem = erro instanceof Error
    ? erro.message
    : (erro && typeof erro === 'object' && 'message' in erro ? String(erro.message) : String(erro));
  return codigo === 'PGRST202'
    || codigo === '42883'
    || /sync_financeiro_emusys_job[\s\S]*(does not exist|schema cache|nao existe)/i.test(mensagem);
};

const unidadesDoAlvo = (alvo: string): UnidadeConfig[] => {
  const unidades = alvo === 'todas' ? UNIDADES : UNIDADES.filter((unidade) => unidade.codigo === alvo);
  if (!unidades.length) throw new Error(`unidade desconhecida: ${alvo}`);
  return unidades;
};

async function enfileirarJanela(
  client: SupabaseClient,
  unidades: UnidadeConfig[],
  janela: { inicio: string; fim: string },
  args: { catalogos: boolean; triggerSource: string; priority: number },
) {
  const jobs: unknown[] = [];
  const blocos = dividirJanela(janela.inicio, janela.fim);
  for (const unidade of unidades) {
    for (let indice = 0; indice < blocos.length; indice += 1) {
      const bloco = blocos[indice];
      jobs.push(await rpcOrThrow(client, 'enqueue_sync_financeiro_emusys_job', {
        p_unidade_codigo: unidade.codigo,
        p_data_inicial: bloco.inicio,
        p_data_final: bloco.fim,
        p_catalogos: args.catalogos && indice === 0,
        p_trigger_source: args.triggerSource,
        p_priority: args.priority,
        p_max_retries: 3,
        p_next_attempt_at: new Date().toISOString(),
      }));
    }
  }
  return jobs;
}

const ehResumoDiario = (triggerSource: string): boolean =>
  /daily|recovery_close/i.test(triggerSource);

async function executarWorker(client: SupabaseClient) {
  const workerId = crypto.randomUUID();
  const job = await rpcOrThrow<QueueJob | null>(client, 'claim_sync_financeiro_emusys_job', {
    p_worker_id: workerId,
    p_lease_seconds: 600,
  });
  if (!job) return { status: 200, body: { success: true, queue_status: 'idle' } };

  const unidade = UNIDADES.find((item) => item.codigo === job.unidade_codigo);
  if (!unidade) throw new Error(`unidade da fila desconhecida: ${job.unidade_codigo}`);
  const janela = { inicio: job.data_inicial, fim: job.data_final };
  const modoResumo: ModoResumo = ehResumoDiario(job.trigger_source) ? 'diario' : 'manutencao';
  const garantirLease = async () => {
    await rpcOrThrow<QueueResult>(client, 'renew_sync_financeiro_emusys_job_lease', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_lease_seconds: 600,
    });
  };

  try {
    await garantirLease();
    const resultado = await processarUnidade(
      client,
      unidade,
      janela,
      job.catalogos,
      ORCAMENTO_PADRAO_SEGUNDOS * 1000,
      Date.now(),
      modoResumo,
      job.attempt_count,
      garantirLease,
    );
    await garantirLease();
    const fila = await rpcOrThrow(client, 'complete_sync_financeiro_emusys_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
    });
    return { status: 200, body: { success: true, queue_status: 'succeeded', fila, resultado } };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await garantirLease();
    await registrarErroResumo(
      client,
      unidade,
      janela,
      mensagem,
      resumoJanela(janela.inicio, janela.fim).length,
      modoResumo,
      erro,
    );

    if (erro instanceof EmusysFinanceiroHttpError && erro.codigo === 'EMUSYS_HTTP_429') {
      const fila = await rpcOrThrow<QueueResult>(client, 'retry_sync_financeiro_emusys_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: erro.codigo,
        p_error_detail: mensagem,
        p_http_status: erro.status,
        p_retry_after_seconds: erro.retryAfterSeconds,
      });
      const queueStatus = fila.status ?? 'failed';
      return {
        status: queueStatus === 'retry_wait' ? 202 : 500,
        body: { success: false, queue_status: queueStatus, fila, erro: mensagem },
      };
    }

    const codigo = erro instanceof EmusysFinanceiroHttpError ? erro.codigo : 'SYNC_FINANCEIRO_EMUSYS_ERROR';
    const httpStatus = erro instanceof EmusysFinanceiroHttpError ? erro.status : null;
    const fila = await rpcOrThrow(client, 'fail_sync_financeiro_emusys_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error_code: codigo,
      p_error_detail: mensagem,
      p_http_status: httpStatus,
    });
    return { status: 500, body: { success: false, queue_status: 'failed', fila, erro: mensagem } };
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ success: false, erro: 'metodo nao permitido' }, 405);
  const supplied = request.headers.get('x-sync-token')?.trim() ?? '';
  const autorizado = (SYNC_ADMIN_TOKEN !== '' && supplied === SYNC_ADMIN_TOKEN)
    || jwtEhServiceRoleDesteProjeto(request.headers.get('Authorization')?.trim() ?? '');
  if (!autorizado) return json({ success: false, erro: 'acesso negado' }, 403);

  try {
    const url = new URL(request.url);
    const corpo = await request.json().catch(() => ({})) as Record<string, unknown>;
    const alvo = String(corpo.unidade ?? url.searchParams.get('u') ?? 'todas').trim().toLowerCase();
    const hoje = String(corpo.hoje ?? hojeBrt()).trim();
    const revarreduraAnual = corpo.revarredura_anual === true || url.searchParams.get('revarredura_anual') === 'true';
    let mode = String(corpo.mode ?? '').trim().toLowerCase();
    if (!mode) mode = corpo.data_inicial || corpo.data_final || revarreduraAnual ? 'enqueue_range' : 'enqueue_daily';

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (mode === 'worker') {
      const resposta = await executarWorker(client);
      return json(resposta.body, resposta.status);
    }

    if (mode === 'queue_status') {
      const jobIds = Array.isArray(corpo.job_ids)
        ? [...new Set(corpo.job_ids.map((valor) => String(valor).trim()))]
        : [];
      if (jobIds.length < 1 || jobIds.length > 100 || jobIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
        return json({ success: false, erro: 'job_ids deve conter de 1 a 100 UUIDs' }, 400);
      }
      const { data, error } = await client
        .from('sync_financeiro_emusys_queue')
        .select('id,unidade_codigo,data_inicial,data_final,status,attempt_count,max_retries,next_attempt_at,last_error_code,last_error_detail,completed_at')
        .in('id', jobIds)
        .order('created_at');
      if (error) throw error;
      return json({ success: true, jobs: data ?? [] });
    }

    if (!['enqueue_daily', 'enqueue_weekly', 'enqueue_range'].includes(mode)) {
      return json({ success: false, erro: `mode desconhecido: ${mode}` }, 400);
    }

    let janela: { inicio: string; fim: string };
    if (mode === 'enqueue_daily') {
      janela = janelaRotinaDiaria(hoje);
    } else if (mode === 'enqueue_weekly') {
      janela = janelaRevarreduraSemanal(hoje);
    } else if (revarreduraAnual) {
      const fim = janelaRotinaDiaria(hoje).fim;
      janela = validarJanelaEncerrada(`${hoje.slice(0, 4)}-01-01`, fim, hoje);
    } else {
      janela = validarJanelaEncerrada(
        String(corpo.data_inicial ?? '').trim(),
        String(corpo.data_final ?? '').trim(),
        hoje,
      );
    }

    const unidades = unidadesDoAlvo(alvo);
    const triggerSource = String(
      corpo.trigger_source ?? (mode === 'enqueue_daily'
        ? 'manual_financeiro_daily'
        : mode === 'enqueue_weekly'
        ? 'manual_financeiro_weekly'
        : 'manual_financeiro_range'),
    ).trim();
    const priority = Number(corpo.priority ?? (mode === 'enqueue_daily' ? 50 : 100));
    if (!Number.isInteger(priority) || priority < 0 || priority > 10000) {
      return json({ success: false, erro: 'priority deve ser inteiro entre 0 e 10000' }, 400);
    }
    const comCatalogos = corpo.catalogos != null ? corpo.catalogos === true : mode === 'enqueue_daily';
    let jobs: unknown[];
    try {
      jobs = await enfileirarJanela(client, unidades, janela, {
        catalogos: comCatalogos,
        triggerSource,
        priority,
      });
    } catch (erro) {
      if (!rpcFilaFinanceiroAusente(erro)) throw erro;
      const comecouEm = Date.now();
      const resultados = [];
      const modoResumo: ModoResumo = ehResumoDiario(triggerSource) ? 'diario' : 'manutencao';
      for (const unidade of unidades) {
        resultados.push(await processarUnidade(
          client,
          unidade,
          janela,
          comCatalogos,
          ORCAMENTO_PADRAO_SEGUNDOS * 1000,
          comecouEm,
          modoResumo,
          1,
        ));
      }
      return json({ success: true, rollout_fallback: true, janela, resultados });
    }
    return json({ success: true, queued: true, queue_status: 'pending', janela, jobs }, 202);
  } catch (erro) {
    console.error('[sync-financeiro]', erro);
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const status = /DIA_CORRENTE_NAO_ENCERRADO|janela|data invalida|unidade desconhecida/i.test(mensagem) ? 400 : 500;
    return json({ success: false, erro: mensagem }, status);
  }
});
