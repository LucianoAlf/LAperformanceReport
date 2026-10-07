/// <reference lib="deno.ns" />

// Espelho do extrato Asaas via Emusys beta (decisão Alf 2026-10-05, mesmo
// caminho de 14/09): o LA Report guarda o espelho; o Super Folha consome pelo
// export; a Maria lê só de lá.
//
// - Catálogo de convênios a cada rodada diária: GET /financeiro/convenios_asaas
//   ?status=todos (a CG tem DOIS ativos: 5 e 7).
// - Extrato por convênio: GET /financeiro/extrato_asaas paginado por offset
//   (limit 100, order=asc, while hasMore). Só convênio 'ativo' aceita.
// - Rotina diária: últimos 10 dias encerrados de cada convênio. Uma vez por mês
//   revarre o mês anterior inteiro. Estorno/chargeback chegam depois — o
//   revarso mensal cobre isso.
// - Um dia só fica 'completo' quando a janela que o cobre veio inteira E a
//   cadeia de balance não quebrou nele (balance anterior + value = balance).
//   Erro/quebra nunca grava dia como vazio.
// - Item vivo que some numa varredura completa do dia → sumiu_em. Nada é apagado.
// - ~1,1 s entre chamadas (o endpoint usa a chave Asaas da escola — nada de
//   loop nem alta frequência, aviso escrito da Emusys). HTTP 429 e 5xx vão
//   para retry_wait; a fila cede quando outra fila Emusys está rodando.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  decidirPersistenciaFalhaDia,
  dividirJanela,
  janelaRotinaDiaria,
  resumoJanela,
  validarJanelaEncerrada,
} from '../_shared/financeiroEmusys.ts';
import {
  type ItemCadeia,
  type ItemExtratoAsaas,
  mapearConvenio,
  mapearItemExtrato,
  verificarCadeiaBalance,
} from '../_shared/financeiroAsaas.ts';
import {
  criarErroHttpFinanceiroEmusys,
  EmusysFinanceiroHttpError,
} from '../_shared/financeiroEmusysHttp.ts';
import { sha256 } from '../_shared/contasReceberExport.ts';

const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_FATURAS_ADMIN_TOKEN')?.trim()
  || Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim()
  || '';
// Mesma credencial alternativa do sync-financeiro-emusys: o gateway validou o
// JWT; aqui basta conferir service_role deste projeto.
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
const PAGE_SIZE = 100;               // limite máximo do extrato_asaas
const INICIO_CARGA_INICIAL = '2024-01-01';

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
async function chamarApi(unidade: UnidadeConfig, caminho: string, params: Record<string, string>) {
  const agora = Date.now();
  if (agora - ultimaChamadaEm < PAUSA_MS) await espera(PAUSA_MS - (agora - ultimaChamadaEm));
  ultimaChamadaEm = Date.now();
  const url = new URL(`${API_BASE}${caminho}`);
  for (const [chave, valor] of Object.entries(params)) url.searchParams.set(chave, valor);
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
  return await http.json() as Record<string, unknown>;
}

// Extrato paginado por offset (hasMore + totalCount), ordem asc — a ordem da
// resposta É a ordem da cadeia de balance.
async function buscarExtrato(
  unidade: UnidadeConfig,
  convenioId: number,
  inicio: string,
  fim: string,
) {
  const itens: ItemExtratoAsaas[] = [];
  let offset = 0;
  for (let pagina = 0; pagina < 400; pagina += 1) {
    const resposta = await chamarApi(unidade, '/financeiro/extrato_asaas', {
      convenio_id: String(convenioId),
      startDate: inicio,
      finishDate: fim,
      offset: String(offset),
      limit: String(PAGE_SIZE),
      order: 'asc',
    });
    const paginaItens = Array.isArray(resposta.data) ? resposta.data as ItemExtratoAsaas[] : null;
    if (!paginaItens) throw new Error('resposta sem data em extrato_asaas');
    itens.push(...paginaItens);
    if (resposta.hasMore !== true) return { itens, totalCount: Number(resposta.totalCount ?? itens.length) };
    if (!paginaItens.length) throw new Error('paginacao inconsistente em extrato_asaas (hasMore sem itens)');
    offset += paginaItens.length;
  }
  throw new Error('paginacao excedeu guarda de seguranca em extrato_asaas');
}

// ── catálogo de convênios ────────────────────────────────────────────────────

async function sincronizarConvenios(client: SupabaseClient, unidade: UnidadeConfig) {
  const resposta = await chamarApi(unidade, '/financeiro/convenios_asaas', { status: 'todos' });
  const lista = Array.isArray(resposta.convenios_asaas)
    ? resposta.convenios_asaas as Record<string, unknown>[]
    : null;
  if (!lista) throw new Error('resposta inesperada em convenios_asaas: sem convenios_asaas');

  const agora = new Date().toISOString();
  const { data: existentes, error } = await client
    .from('financeiro_asaas_convenios')
    .select('convenio_id,hash_conteudo,alterado_em,primeira_vez_visto')
    .eq('unidade_id', unidade.id);
  if (error) throw error;
  const mapa = new Map<number, { hash_conteudo: string; alterado_em: string | null; primeira_vez_visto: string }>(
    (existentes ?? []).map((row) => [Number(row.convenio_id), row as never]),
  );

  const linhas: Record<string, unknown>[] = [];
  for (const cru of lista) {
    const base = mapearConvenio(cru);
    const hash = await sha256(base);
    const anterior = mapa.get(base.convenio_id);
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
  if (linhas.length) {
    const { error: erroUpsert } = await client
      .from('financeiro_asaas_convenios')
      .upsert(linhas, { onConflict: 'unidade_id,convenio_id' });
    if (erroUpsert) throw erroUpsert;
  }
  const vistos = linhas.length ? `(${linhas.map((l) => String(l.convenio_id)).join(',')})` : null;
  let morte = client.from('financeiro_asaas_convenios')
    .update({ sumiu_em: agora }).eq('unidade_id', unidade.id).is('sumiu_em', null);
  if (vistos) morte = morte.not('convenio_id', 'in', vistos);
  const { error: erroMorte } = await morte;
  if (erroMorte) throw erroMorte;
  return linhas;
}

async function conveniosAtivos(client: SupabaseClient, unidade: UnidadeConfig) {
  const { data, error } = await client
    .from('financeiro_asaas_convenios')
    .select('convenio_id,status')
    .eq('unidade_id', unidade.id)
    .is('sumiu_em', null);
  if (error) throw error;
  return (data ?? [])
    .filter((c) => String(c.status).toLowerCase() === 'ativo')
    .map((c) => Number(c.convenio_id));
}

// ── gravação do extrato ──────────────────────────────────────────────────────

async function carregarExistentes(client: SupabaseClient, unidadeId: string, convenioId: number, ids: string[]) {
  const mapa = new Map<string, { hash_conteudo: string; alterado_em: string | null; primeira_vez_visto: string }>();
  for (let ini = 0; ini < ids.length; ini += 300) {
    const { data: rows, error } = await client
      .from('financeiro_asaas_extrato')
      .select('asaas_id,hash_conteudo,alterado_em,primeira_vez_visto')
      .eq('unidade_id', unidadeId)
      .eq('convenio_id', convenioId)
      .in('asaas_id', ids.slice(ini, ini + 300));
    if (error) throw error;
    for (const row of rows ?? []) mapa.set(String(row.asaas_id), row as never);
  }
  return mapa;
}

async function gravarStatusDia(
  client: SupabaseClient,
  unidadeId: string,
  convenioId: number,
  data: string,
  registro: { status: 'completo' | 'erro'; itens: number; balance_quebras?: number; ultimo_erro?: string | null; tentativas: number; iniciado_em: string },
) {
  const agora = new Date().toISOString();
  const { error } = await client
    .from('financeiro_asaas_varredura_dias')
    .upsert({
      unidade_id: unidadeId,
      convenio_id: convenioId,
      data,
      status: registro.status,
      itens: registro.itens,
      balance_quebras: registro.balance_quebras ?? 0,
      tentativas: registro.tentativas,
      ultimo_erro: registro.ultimo_erro ?? null,
      iniciado_em: registro.iniciado_em,
      concluido_em: registro.status === 'completo' ? agora : null,
      ultima_tentativa_em: agora,
    }, { onConflict: 'unidade_id,convenio_id,data' });
  if (error) throw error;
}

async function gravarFalhaDia(
  client: SupabaseClient,
  unidadeId: string,
  convenioId: number,
  data: string,
  mensagem: string,
  tentativas: number,
  iniciadoEm: string,
) {
  const { data: anterior, error: erroAnterior } = await client
    .from('financeiro_asaas_varredura_dias')
    .select('status,concluido_em')
    .eq('unidade_id', unidadeId)
    .eq('convenio_id', convenioId)
    .eq('data', data)
    .maybeSingle();
  if (erroAnterior) throw erroAnterior;

  const decisao = decidirPersistenciaFalhaDia(
    anterior as { status: 'completo' | 'erro'; concluido_em: string | null } | null,
    mensagem,
    { tentativas, iniciado_em: iniciadoEm },
  );
  if (decisao.modo === 'preservar_completo') {
    const { error } = await client
      .from('financeiro_asaas_varredura_dias')
      .update({ ...decisao.atualizacao, ultima_tentativa_em: new Date().toISOString() })
      .eq('unidade_id', unidadeId)
      .eq('convenio_id', convenioId)
      .eq('data', data)
      .eq('status', 'completo');
    if (error) throw error;
    return;
  }
  await gravarStatusDia(client, unidadeId, convenioId, data, decisao.registro);
}

// Saldo do último item gravado antes da janela — semente da cadeia de balance.
async function saldoAntesDaJanela(
  client: SupabaseClient,
  unidadeId: string,
  convenioId: number,
  inicio: string,
): Promise<number | null> {
  const { data, error } = await client
    .from('financeiro_asaas_extrato')
    .select('balance')
    .eq('unidade_id', unidadeId)
    .eq('convenio_id', convenioId)
    .lt('data', inicio)
    .is('sumiu_em', null)
    .order('data', { ascending: false })
    .order('posicao_dia', { ascending: false })
    .limit(1);
  if (error) throw error;
  const balance = data?.[0]?.balance;
  return balance == null ? null : Number(balance);
}

// Varre uma janela inteira de UM convênio: fetch paginado, cadeia de balance,
// upsert com tracking, sumiu_em só em dias completos.
async function processarConvenio(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  convenioId: number,
  janela: { inicio: string; fim: string },
  tentativaNumero: number,
  garantirLease?: () => Promise<void>,
) {
  const iniciou = new Date().toISOString();
  const diasJanela = resumoJanela(janela.inicio, janela.fim);

  let coletado: { itens: ItemExtratoAsaas[]; totalCount: number };
  try {
    coletado = await buscarExtrato(unidade, convenioId, janela.inicio, janela.fim);
  } catch (erro) {
    // a janela inteira não veio: nenhum dia vale como vazio
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await garantirLease?.();
    for (const dia of diasJanela) {
      await gravarFalhaDia(client, unidade.id, convenioId, dia, mensagem, tentativaNumero, iniciou);
    }
    throw erro;
  }
  await garantirLease?.();

  // posicao_dia = índice do item dentro do próprio dia na ordem da resposta
  const contadorDia = new Map<string, number>();
  const itensPorDia = new Map<string, typeof coletado.itens>();
  const cadeia: ItemCadeia[] = [];
  const mapeados = [];
  for (const cru of coletado.itens) {
    const dia = String(cru.date ?? '').slice(0, 10);
    const posicao = contadorDia.get(dia) ?? 0;
    contadorDia.set(dia, posicao + 1);
    if (!itensPorDia.has(dia)) itensPorDia.set(dia, []);
    itensPorDia.get(dia)!.push(cru);
    const mapeado = await mapearItemExtrato(cru, unidade.id, convenioId, posicao);
    mapeados.push(mapeado);
    cadeia.push({ asaas_id: mapeado.asaas_id, data: mapeado.data, valor: mapeado.valor, balance: mapeado.balance });
  }

  // cadeia de balance do convênio, semeada pelo último saldo gravado antes da janela
  const saldoAnterior = await saldoAntesDaJanela(client, unidade.id, convenioId, janela.inicio);
  const quebras = verificarCadeiaBalance(cadeia, saldoAnterior);
  const diasComQuebra = new Map<string, number>();
  for (const quebra of quebras) {
    diasComQuebra.set(quebra.data, (diasComQuebra.get(quebra.data) ?? 0) + 1);
  }

  // upsert dos itens (mesmo com quebra — o dado veio da origem, a marcação de
  // erro fica no dia, não no item)
  const existentes = await carregarExistentes(client, unidade.id, convenioId, mapeados.map((m) => m.asaas_id));
  const agora = new Date().toISOString();
  const linhas = mapeados.map((mapeado) => {
    const anterior = existentes.get(mapeado.asaas_id);
    return {
      ...mapeado,
      primeira_vez_visto: anterior?.primeira_vez_visto ?? agora,
      ultima_vez_visto: agora,
      alterado_em: anterior && anterior.hash_conteudo !== mapeado.hash_conteudo ? agora : (anterior?.alterado_em ?? null),
      sumiu_em: null,
    };
  });
  for (let ini = 0; ini < linhas.length; ini += 200) {
    await garantirLease?.();
    const { error } = await client
      .from('financeiro_asaas_extrato')
      .upsert(linhas.slice(ini, ini + 200), { onConflict: 'unidade_id,convenio_id,asaas_id' });
    if (error) throw error;
  }

  // por dia: completo (com sumiu_em dos que sumiram) ou erro por quebra de cadeia
  for (const dia of diasJanela) {
    await garantirLease?.();
    const itensDia = itensPorDia.get(dia) ?? [];
    const quebrasDia = diasComQuebra.get(dia) ?? 0;
    if (quebrasDia === 0) {
      // ids Asaas são "ftn_<dígitos>" — só word chars, sem citação na lista `in`
      // do PostgREST (aspa simples viraria parte literal do valor e o filtro
      // nunca casaria → tudo viraria sumiu_em)
      const vistos = itensDia.length
        ? `(${itensDia.map((i) => String(i.id)).join(',')})`
        : null;
      let morte = client
        .from('financeiro_asaas_extrato')
        .update({ sumiu_em: agora })
        .eq('unidade_id', unidade.id)
        .eq('convenio_id', convenioId)
        .eq('data', dia)
        .is('sumiu_em', null);
      if (vistos) morte = morte.not('asaas_id', 'in', vistos);
      const { error: erroMorte } = await morte;
      if (erroMorte) throw erroMorte;
      await gravarStatusDia(client, unidade.id, convenioId, dia, {
        status: 'completo', itens: itensDia.length, balance_quebras: 0,
        tentativas: tentativaNumero, iniciado_em: iniciou,
      });
    } else {
      const detalhe = quebras
        .filter((q) => q.data === dia)
        .map((q) => `${q.asaas_id}: esperado ${q.esperado} encontrado ${q.encontrado}`)
        .join('; ')
        .slice(0, 400);
      await gravarStatusDia(client, unidade.id, convenioId, dia, {
        status: 'erro', itens: itensDia.length, balance_quebras: quebrasDia,
        ultimo_erro: `BALANCE_QUEBRADO: ${detalhe}`,
        tentativas: tentativaNumero, iniciado_em: iniciou,
      });
    }
  }

  return {
    convenio_id: convenioId,
    itens: coletado.itens.length,
    dias_completos: diasJanela.length - diasComQuebra.size,
    dias_com_quebra: diasComQuebra.size,
    balance_quebras: quebras.length,
  };
}

// Resumo por (unidade, convenio): janela monitorada + fronteira da carga inicial
async function gravarResumoConvenio(
  client: SupabaseClient,
  unidadeId: string,
  convenioId: number,
  janela: { inicio: string; fim: string },
  args: {
    janelaCompleta: boolean;
    modoResumo: 'diario' | 'mensal' | 'manutencao';
    ultimoErro: string | null;
    diasPendentes: number;
  },
) {
  const agora = new Date().toISOString();
  const { data: anterior, error: erroAnterior } = await client
    .from('financeiro_asaas_varredura_resumo')
    .select('ultima_varredura_completa_em,ultima_revarredura_mensal_em,carga_inicial_concluida_ate,janela_inicio,janela_fim,dias_pendentes')
    .eq('unidade_id', unidadeId)
    .eq('convenio_id', convenioId)
    .maybeSingle();
  if (erroAnterior) throw erroAnterior;

  // fronteira da carga inicial: só avança contígua a partir de 2024-01-01
  let cargaAte = anterior?.carga_inicial_concluida_ate ?? null;
  if (args.janelaCompleta) {
    const fronteira = cargaAte ?? '2023-12-31';
    const diaSeguinte = new Date(`${fronteira}T00:00:00Z`);
    diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
    const limiteContiguo = diaSeguinte.toISOString().slice(0, 10);
    if (janela.inicio <= limiteContiguo && janela.fim > fronteira) {
      cargaAte = janela.fim;
    }
  }

  const registro: Record<string, unknown> = {
    unidade_id: unidadeId,
    convenio_id: convenioId,
    ultima_tentativa_em: agora,
    ultimo_erro: args.ultimoErro,
    atualizado_em: agora,
    carga_inicial_concluida_ate: cargaAte,
    ultima_varredura_completa_em: args.janelaCompleta
      ? agora
      : (anterior?.ultima_varredura_completa_em ?? null),
    ultima_revarredura_mensal_em: args.modoResumo === 'mensal' && args.janelaCompleta
      ? agora
      : (anterior?.ultima_revarredura_mensal_em ?? null),
  };
  if (args.modoResumo === 'diario') {
    registro.janela_inicio = janela.inicio;
    registro.janela_fim = janela.fim;
    registro.dias_pendentes = args.diasPendentes;
  } else {
    registro.janela_inicio = anterior?.janela_inicio ?? janela.inicio;
    registro.janela_fim = anterior?.janela_fim ?? janela.fim;
    registro.dias_pendentes = anterior?.dias_pendentes ?? args.diasPendentes;
  }

  const { error } = await client
    .from('financeiro_asaas_varredura_resumo')
    .upsert(registro, { onConflict: 'unidade_id,convenio_id' });
  if (error) throw error;
}

async function processarUnidade(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  janela: { inicio: string; fim: string },
  comCatalogos: boolean,
  convenioAlvo: number | null,
  orcamentoMs: number,
  comecouEm: number,
  modoResumo: 'diario' | 'mensal' | 'manutencao',
  tentativaNumero = 1,
  garantirLease?: () => Promise<void>,
) {
  if (!unidade.token) throw new Error(`token Emusys ausente para ${unidade.codigo}`);
  const resultado: Record<string, unknown> = { unidade: unidade.codigo, convenios: [] as unknown[] };

  if (comCatalogos) {
    try {
      const gravados = await sincronizarConvenios(client, unidade);
      resultado.convenios_catalogo = gravados.length;
    } catch (erro) {
      // catálogo falhou não derruba o extrato: seguimos com o último catálogo bom
      resultado.convenios_catalogo = { erro: erro instanceof Error ? erro.message : String(erro) };
      console.error(`[sync-asaas] catalogo ${unidade.codigo}:`, erro);
    }
  }

  const ativos = await conveniosAtivos(client, unidade);
  const alvos = convenioAlvo != null ? [convenioAlvo] : ativos;
  if (!alvos.length) {
    resultado.aviso = 'nenhum convenio ativo conhecido';
    return resultado;
  }

  const resultados: Record<string, unknown>[] = [];
  for (const convenioId of alvos) {
    if (Date.now() - comecouEm >= orcamentoMs) {
      throw new Error(`SYNC_ORCAMENTO_EXCEDIDO: ${unidade.codigo} convenio ${convenioId}`);
    }
    try {
      resultados.push(await processarConvenio(
        client, unidade, convenioId, janela, tentativaNumero, garantirLease,
      ));
      const comQuebra = Number((resultados.at(-1) as Record<string, unknown>).dias_com_quebra ?? 0) > 0;
      await gravarResumoConvenio(client, unidade.id, convenioId, janela, {
        janelaCompleta: !comQuebra,
        modoResumo,
        ultimoErro: comQuebra
          ? `BALANCE_QUEBRADO em ${(resultados.at(-1) as Record<string, unknown>).dias_com_quebra} dia(s)`
          : null,
        diasPendentes: Number((resultados.at(-1) as Record<string, unknown>).dias_com_quebra ?? 0),
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await garantirLease?.();
      await gravarResumoConvenio(client, unidade.id, convenioId, janela, {
        janelaCompleta: false,
        modoResumo,
        ultimoErro: mensagem.slice(0, 400),
        diasPendentes: resumoJanela(janela.inicio, janela.fim).length,
      });
      throw erro;
    }
  }
  resultado.convenios = resultados;
  resultado.janela_completa = true;
  return resultado;
}

// ── fila durável ─────────────────────────────────────────────────────────────

type QueueJob = {
  id: string;
  unidade_codigo: string;
  convenio_id: number | null;
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

const rpcFilaAsaasAusente = (erro: unknown): boolean => {
  const codigo = erro && typeof erro === 'object' && 'code' in erro ? String(erro.code) : '';
  const mensagem = erro instanceof Error
    ? erro.message
    : (erro && typeof erro === 'object' && 'message' in erro ? String(erro.message) : String(erro));
  return codigo === 'PGRST202'
    || codigo === '42883'
    || /sync_asaas_extrato[\s\S]*(does not exist|schema cache|nao existe)/i.test(mensagem);
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
  args: { catalogos: boolean; triggerSource: string; priority: number; convenioId: number | null; blocoDias: number },
) {
  const jobs: unknown[] = [];
  const blocos = dividirJanela(janela.inicio, janela.fim, args.blocoDias);
  for (const unidade of unidades) {
    for (let indice = 0; indice < blocos.length; indice += 1) {
      const bloco = blocos[indice];
      jobs.push(await rpcOrThrow(client, 'enqueue_sync_asaas_extrato_job', {
        p_unidade_codigo: unidade.codigo,
        p_data_inicial: bloco.inicio,
        p_data_final: bloco.fim,
        p_catalogos: args.catalogos && indice === 0,
        p_trigger_source: args.triggerSource,
        p_convenio_id: args.convenioId,
        p_priority: args.priority,
        p_max_retries: 3,
        p_next_attempt_at: new Date().toISOString(),
      }));
    }
  }
  return jobs;
}

const ehResumoDiario = (triggerSource: string): boolean => /daily|recovery_close/i.test(triggerSource);
const ehResumoMensal = (triggerSource: string): boolean => /mensal|revarredura_mensal/i.test(triggerSource);

// mês anterior inteiro (revarredura mensal pedida pelo Super Folha)
function janelaMesAnterior(hojeBrt: string): { inicio: string; fim: string } {
  const hoje = new Date(`${hojeBrt}T00:00:00Z`);
  const inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0));
  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) };
}

async function executarWorker(client: SupabaseClient) {
  const workerId = crypto.randomUUID();
  const job = await rpcOrThrow<QueueJob | null>(client, 'claim_sync_asaas_extrato_job', {
    p_worker_id: workerId,
    p_lease_seconds: 600,
  });
  if (!job) return { status: 200, body: { success: true, queue_status: 'idle' } };

  const unidade = UNIDADES.find((item) => item.codigo === job.unidade_codigo);
  if (!unidade) throw new Error(`unidade da fila desconhecida: ${job.unidade_codigo}`);
  const janela = { inicio: job.data_inicial, fim: job.data_final };
  const modoResumo = ehResumoMensal(job.trigger_source)
    ? 'mensal'
    : ehResumoDiario(job.trigger_source) ? 'diario' : 'manutencao';
  const garantirLease = async () => {
    await rpcOrThrow<QueueResult>(client, 'renew_sync_asaas_extrato_job_lease', {
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
      job.convenio_id == null ? null : Number(job.convenio_id),
      ORCAMENTO_PADRAO_SEGUNDOS * 1000,
      Date.now(),
      modoResumo,
      job.attempt_count,
      garantirLease,
    );
    await garantirLease();
    const fila = await rpcOrThrow(client, 'complete_sync_asaas_extrato_job', {
      p_job_id: job.id,
      p_worker_id: workerId,
    });
    return { status: 200, body: { success: true, queue_status: 'succeeded', fila, resultado } };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await garantirLease();

    // 429 e 5xx (o teto da Emusys devolve 500 "erro desconhecido", não 429)
    // são transitórios: retry_wait. Erros 4xx de parâmetro falham de vez.
    const transitorio = erro instanceof EmusysFinanceiroHttpError
      && (erro.codigo === 'EMUSYS_HTTP_429' || erro.status >= 500);
    if (transitorio) {
      const fila = await rpcOrThrow<QueueResult>(client, 'retry_sync_asaas_extrato_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_error_code: erro instanceof EmusysFinanceiroHttpError ? erro.codigo : 'SYNC_ASAAS_ERROR',
        p_error_detail: mensagem,
        p_http_status: erro instanceof EmusysFinanceiroHttpError ? erro.status : null,
        p_retry_after_seconds: erro instanceof EmusysFinanceiroHttpError ? erro.retryAfterSeconds : null,
      });
      const queueStatus = fila.status ?? 'failed';
      return {
        status: queueStatus === 'retry_wait' ? 202 : 500,
        body: { success: false, queue_status: queueStatus, fila, erro: mensagem },
      };
    }

    const codigo = erro instanceof EmusysFinanceiroHttpError ? erro.codigo : 'SYNC_ASAAS_ERROR';
    const httpStatus = erro instanceof EmusysFinanceiroHttpError ? erro.status : null;
    const fila = await rpcOrThrow(client, 'fail_sync_asaas_extrato_job', {
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
    const revarreduraMensal = corpo.revarredura_mensal === true || url.searchParams.get('revarredura_mensal') === 'true';
    let mode = String(corpo.mode ?? '').trim().toLowerCase();
    if (!mode) mode = corpo.data_inicial || corpo.data_final || revarreduraMensal ? 'enqueue_range' : 'enqueue_daily';

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
      if (jobIds.length < 1 || jobIds.length > 200 || jobIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
        return json({ success: false, erro: 'job_ids deve conter de 1 a 200 UUIDs' }, 400);
      }
      const { data, error } = await client
        .from('sync_asaas_extrato_queue')
        .select('id,unidade_codigo,convenio_id,data_inicial,data_final,status,attempt_count,max_retries,next_attempt_at,last_error_code,last_error_detail,completed_at')
        .in('id', jobIds)
        .order('created_at');
      if (error) throw error;
      return json({ success: true, jobs: data ?? [] });
    }

    if (!['enqueue_daily', 'enqueue_monthly', 'enqueue_range'].includes(mode)) {
      return json({ success: false, erro: `mode desconhecido: ${mode}` }, 400);
    }

    let janela: { inicio: string; fim: string };
    if (mode === 'enqueue_daily') {
      janela = janelaRotinaDiaria(hoje);
    } else if (mode === 'enqueue_monthly') {
      janela = janelaMesAnterior(hoje);
      // a revarredura mensal também aceita o mês corrente parcial quando pedida
      // explicitamente com data_inicial/data_final via enqueue_range
    } else if (revarreduraMensal) {
      janela = janelaMesAnterior(hoje);
    } else {
      janela = validarJanelaEncerrada(
        String(corpo.data_inicial ?? '').trim(),
        String(corpo.data_final ?? '').trim(),
        hoje,
      );
    }

    const unidades = unidadesDoAlvo(alvo);
    const convenioId = corpo.convenio_id == null ? null : Number(corpo.convenio_id);
    if (convenioId != null && (!Number.isSafeInteger(convenioId) || convenioId <= 0)) {
      return json({ success: false, erro: 'convenio_id deve ser inteiro positivo quando informado' }, 400);
    }
    const triggerSource = String(
      corpo.trigger_source ?? (mode === 'enqueue_daily'
        ? 'manual_asaas_daily'
        : mode === 'enqueue_monthly'
        ? 'asaas_revarredura_mensal'
        : 'manual_asaas_range'),
    ).trim();
    const priority = Number(corpo.priority ?? (mode === 'enqueue_daily' ? 50 : 100));
    if (!Number.isInteger(priority) || priority < 0 || priority > 10000) {
      return json({ success: false, erro: 'priority deve ser inteiro entre 0 e 10000' }, 400);
    }
    const blocoDias = Number(corpo.bloco_dias ?? 10);
    if (!Number.isInteger(blocoDias) || blocoDias < 1 || blocoDias > 92) {
      return json({ success: false, erro: 'bloco_dias deve ser inteiro entre 1 e 92' }, 400);
    }
    const comCatalogos = corpo.catalogos != null ? corpo.catalogos === true : mode === 'enqueue_daily';
    let jobs: unknown[];
    try {
      jobs = await enfileirarJanela(client, unidades, janela, {
        catalogos: comCatalogos,
        triggerSource,
        priority,
        convenioId,
        blocoDias,
      });
    } catch (erro) {
      if (!rpcFilaAsaasAusente(erro)) throw erro;
      const comecouEm = Date.now();
      const resultados = [];
      const modoResumo = ehResumoMensal(triggerSource) ? 'mensal' : ehResumoDiario(triggerSource) ? 'diario' : 'manutencao';
      for (const unidade of unidades) {
        resultados.push(await processarUnidade(
          client,
          unidade,
          janela,
          comCatalogos,
          convenioId,
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
    console.error('[sync-asaas]', erro);
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const status = /DIA_CORRENTE|DIA_NAO|janela|data invalida|unidade desconhecida|convenio/i.test(mensagem) ? 400 : 500;
    return json({ success: false, erro: mensagem }, status);
  }
});
