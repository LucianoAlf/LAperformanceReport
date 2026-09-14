/// <reference lib="deno.ns" />

// Espelho dos endpoints financeiros beta do Emusys (decisão Alf 2026-09-14):
// o LA Report guarda o espelho; o Super Folha consome; a Maria lê só de lá.
//
// - Catálogos completos a cada rodada: /financeiro/contas_financeiras,
//   /financeiro/plano_contas, /financeiro/formas_pagamento.
//   ⚠️ CG retorna HTTP 500 "erro desconhecido" em contas_financeiras desde
//   14/09/2026 — bug da origem: registramos e seguimos; NUNCA apaga o que havia.
// - Lançamentos revarridos DIA A DIA (fonte não tem updated_em). Rotina diária:
//   mês corrente + 2 anteriores. Um dia só vale se TODAS as páginas vieram.
//   Erro nunca grava dia como vazio: o dia fica 'erro'/pendente.
// - Item vivo que some numa varredura completa do dia → sumiu_em. Nada é apagado.
// - ~1,1 s entre chamadas; 429 ou 500 repetido = teto da API (~120 chamadas,
//   medido no acerto com o Emusys) → recuo exponencial e nova tentativa.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  extrairCodigoPlano,
  janelaRotinaDiaria,
  mapearLancamento,
  resumoJanela,
  sha256,
  type LancamentoEmusys,
} from '../_shared/financeiroEmusys.ts';

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
const TENTATIVAS_MAX = 6;
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
// tentativasMax baixo para catálogos: o 500 "erro desconhecido" das contas da CG
// é PERSISTENTE (bug da origem) — insistir estouraria o timeout do gateway.
async function buscarJsonPaginado(
  unidade: UnidadeConfig,
  caminho: string,
  params: Record<string, string>,
  tentativasMax: number = TENTATIVAS_MAX,
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

    let resposta: Record<string, unknown> | null = null;
    for (let tentativa = 1; tentativa <= tentativasMax; tentativa += 1) {
      const agora = Date.now();
      if (agora - ultimaChamadaEm < PAUSA_MS) await espera(PAUSA_MS - (agora - ultimaChamadaEm));
      ultimaChamadaEm = Date.now();
      const http = await fetch(url, { headers: { token: unidade.token } });
      if (http.status === 429 || http.status >= 500) {
        // O teto da API devolve 500 "erro desconhecido" (não 429) — o catálogo de
        // contas da CG também devolve esse mesmo 500 de forma PERSISTENTE. Por isso
        // erro de catálogo desiste cedo (caller decide), mas erro em lançamentos é
        // o sinal de teto: recuo exponencial longo.
        const recuo = Math.min(120000, 10000 * 2 ** (tentativa - 1));
        console.warn(`[sync-financeiro] ${unidade.codigo} ${caminho} HTTP ${http.status} — recuo ${recuo / 1000}s (${tentativa}/${tentativasMax})`);
        await espera(recuo);
        continue;
      }
      if (!http.ok) {
        const texto = await http.text();
        throw new Error(`HTTP ${http.status} em ${caminho}: ${texto.slice(0, 200)}`);
      }
      resposta = await http.json();
      break;
    }
    if (!resposta) throw new Error(`EMUSYS_HTTP_5XX persistente em ${caminho} (${unidade.codigo}, ${tentativasMax} tentativas)`);

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
    const { error } = await client
      .from('financeiro_emusys_lancamentos')
      .upsert(linhas.slice(ini, ini + 200), { onConflict: 'unidade_id,emusys_lancamento_id' });
    if (error) throw error;
  }

  // dia SEM nenhum item também é resposta completa da origem — aplicar sumiu_em
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
) {
  // 2 tentativas bastam: 500 persistente em catálogo é dado zoado na origem, não teto
  const resposta = await buscarJsonPaginado(unidade, caminho, {}, 2);
  const lista = Array.isArray((resposta as Record<string, unknown>)[chaveRaiz])
    ? (resposta as Record<string, unknown>)[chaveRaiz] as Record<string, unknown>[]
    : null;
  if (!lista) throw new Error(`resposta inesperada em ${caminho}: sem ${chaveRaiz}`);

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
    const { error: erroUpsert } = await client
      .from(tabela)
      .upsert(linhas.slice(ini, ini + 200), { onConflict: `unidade_id,${colunaIdApi}` });
    if (erroUpsert) throw erroUpsert;
  }
  const vistos = linhas.length ? `(${linhas.map((l) => String(l[colunaIdApi])).join(',')})` : null;
  let morte = client.from(tabela).update({ sumiu_em: agora }).eq('unidade_id', unidade.id).is('sumiu_em', null);
  if (vistos) morte = morte.not(colunaIdApi, 'in', vistos);
  const { error: erroMorte } = await morte;
  if (erroMorte) throw erroMorte;
  return linhas.length;
}

// ── orquestração da unidade ──────────────────────────────────────────────────

async function processarUnidade(
  client: SupabaseClient,
  unidade: UnidadeConfig,
  janela: { inicio: string; fim: string },
  comCatalogos: boolean,
  orcamentoMs: number,
  comecouEm: number,
) {
  if (!unidade.token) throw new Error(`token Emusys ausente para ${unidade.codigo}`);
  const resultado: Record<string, unknown> = { unidade: unidade.codigo, catalogos: {} as Record<string, unknown> };
  const catalogos = resultado.catalogos as Record<string, unknown>;

  if (comCatalogos) {
    try {
      catalogos.contas = await sincronizarCatalogo(
        client, unidade, '/financeiro/contas_financeiras', 'financeiro_emusys_contas', 'contas_financeiras',
        (cru) => Promise.resolve({
          emusys_conta_id: Number(cru.id),
          descricao: cru.descricao ?? null,
          tipo: cru.tipo ?? null,
          banco: cru.banco ?? null,
          status: cru.status ?? null,
        }),
        'emusys_conta_id',
      );
    } catch (erro) {
      // Erro de catálogo não derruba lançamentos: fica no resumo.catalogos_erro.
      catalogos.contas = { erro: erro instanceof Error ? erro.message : String(erro) };
      console.error(`[sync-financeiro] contas ${unidade.codigo}:`, erro);
    }
    try {
      catalogos.plano_contas = await sincronizarCatalogo(
        client, unidade, '/financeiro/plano_contas', 'financeiro_emusys_plano_contas', 'plano_contas',
        (cru) => Promise.resolve({
          emusys_plano_id: Number(cru.id),
          nome: cru.nome ?? null,
          codigo_api: cru.codigo ?? null,
          codigo_extraido: extrairCodigoPlano(cru.nome),
          id_pai: cru.id_pai == null ? null : Number(cru.id_pai),
          tipo: cru.tipo ?? null,
          natureza: cru.natureza ?? null,
          status: cru.status ?? null,
        }),
        'emusys_plano_id',
      );
    } catch (erro) {
      catalogos.plano_contas = { erro: erro instanceof Error ? erro.message : String(erro) };
      console.error(`[sync-financeiro] plano_contas ${unidade.codigo}:`, erro);
    }
    try {
      catalogos.formas_pagamento = await sincronizarCatalogo(
        client, unidade, '/financeiro/formas_pagamento', 'financeiro_emusys_formas_pagamento', 'formas_pagamento',
        (cru) => Promise.resolve({
          emusys_forma_id: Number(cru.id),
          descricao: cru.descricao ?? null,
          id_pai: cru.id_pai == null ? null : Number(cru.id_pai),
          generico: cru.generico ?? null,
        }),
        'emusys_forma_id',
      );
    } catch (erro) {
      catalogos.formas_pagamento = { erro: erro instanceof Error ? erro.message : String(erro) };
      console.error(`[sync-financeiro] formas ${unidade.codigo}:`, erro);
    }
  }

  const diasJanela = resumoJanela(janela.inicio, janela.fim);
  const { data: completos, error: erroCompletos } = await client
    .from('financeiro_emusys_varredura_dias')
    .select('data')
    .eq('unidade_id', unidade.id)
    .eq('status', 'completo')
    .gte('data', janela.inicio)
    .lte('data', janela.fim);
  if (erroCompletos) throw erroCompletos;
  const completosSet = new Set((completos ?? []).map((row) => String(row.data)));
  let pendentes = diasJanela.filter((dia) => !completosSet.has(dia));

  let diasProcessados = 0;
  const falhas: string[] = [];
  while (pendentes.length && Date.now() - comecouEm < orcamentoMs) {
    const dia = pendentes[0];
    const iniciou = new Date().toISOString();
    try {
      const coletado = await buscarJsonPaginado(unidade, '/financeiro/lancamentos', {
        data_inicial: dia,
        data_final: dia,
      });
      const itens = ((coletado as Record<string, unknown>).items ?? []) as Record<string, unknown>[];
      await gravarDia(client, unidade, dia, itens);
      await gravarStatusDia(client, unidade.id, dia, {
        status: 'completo', itens: itens.length, tentativas: 1, iniciado_em: iniciou,
      });
      diasProcessados += 1;
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      // NUNCA gravar o dia como vazio por erro: fica pendente até a API responder.
      await gravarStatusDia(client, unidade.id, dia, {
        status: 'erro', itens: 0, ultimo_erro: mensagem.slice(0, 400), tentativas: TENTATIVAS_MAX, iniciado_em: iniciou,
      });
      falhas.push(`${dia}: ${mensagem.slice(0, 120)}`);
      console.error(`[sync-financeiro] dia ${dia} ${unidade.codigo}:`, erro);
    }
    pendentes = pendentes.slice(1);
  }

  // resumo por unidade
  const restantes = pendentes.length;
  const agora = new Date().toISOString();
  const { data: anterior } = await client
    .from('financeiro_emusys_varredura_resumo')
    .select('ultima_varredura_completa_em')
    .eq('unidade_id', unidade.id)
    .maybeSingle();
  const { error: erroResumo } = await client
    .from('financeiro_emusys_varredura_resumo')
    .upsert({
      unidade_id: unidade.id,
      janela_inicio: janela.inicio,
      janela_fim: janela.fim,
      ultima_tentativa_em: agora,
      dias_pendentes: restantes,
      catalogos_erro: Object.fromEntries(
        Object.entries(catalogos).filter(([, v]) => typeof v === 'object' && v !== null && 'erro' in (v as object)),
      ),
      ultimo_erro: falhas[0] ?? null,
      // só avança quando a janela inteira fecha sem pendência
      ultima_varredura_completa_em: restantes === 0 ? agora : (anterior?.ultima_varredura_completa_em ?? null),
      atualizado_em: agora,
    }, { onConflict: 'unidade_id' });
  if (erroResumo) throw erroResumo;

  resultado.dias_processados = diasProcessados;
  resultado.dias_pendentes = restantes;
  resultado.janela_completa = restantes === 0;
  if (falhas.length) resultado.falhas = falhas;
  return resultado;
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
    const hoje = String(corpo.hoje ?? hojeBrt());
    const janelaPadrao = janelaRotinaDiaria(hoje);
    const inicio = String(corpo.data_inicial ?? janelaPadrao.inicio).trim();
    const fim = String(corpo.data_final ?? janelaPadrao.fim).trim();
    // janela explícita = backfill: catálogos ficam para a chamada final da rodada
    const comCatalogos = corpo.catalogos != null ? corpo.catalogos === true : !(corpo.data_inicial || corpo.data_final);
    const orcamento = Math.min(200, Math.max(30, Number(corpo.orcamento_segundos ?? ORCAMENTO_PADRAO_SEGUNDOS))) * 1000;

    if (fim < inicio) return json({ success: false, erro: 'data_final anterior a data_inicial' }, 400);

    const unidades = alvo === 'todas' ? UNIDADES : UNIDADES.filter((u) => u.codigo === alvo);
    if (!unidades.length) return json({ success: false, erro: `unidade desconhecida: ${alvo}` }, 400);

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const comecouEm = Date.now();
    const resultados = [];
    for (const unidade of unidades) {
      if (Date.now() - comecouEm >= orcamento) break;
      resultados.push(await processarUnidade(client, unidade, { inicio, fim }, comCatalogos, orcamento, comecouEm));
    }
    return json({ success: true, janela: { inicio, fim }, resultados });
  } catch (erro) {
    console.error('[sync-financeiro]', erro);
    return json({ success: false, erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
