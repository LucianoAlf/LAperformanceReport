// Edge Function: orquestrar-historico-professor
//
// POR QUE EXISTE: nem `backfill-historico-professor-emusys` nem
// `reconstruir-periodos-professor` podem ser dirigidas por um `pg_cron` simples —
//   - o backfill exige um `execucao_id` criado FORA dela e avança no máximo 10 páginas
//     por chamada (caminha mês a mês);
//   - a reconstrução exige `particao_indice` explícito, 32 por unidade.
// Um `net.http_post` só faz UMA chamada. Este orquestrador é re-entrante: cada invocação
// faz um pedaço dentro de um orçamento de tempo e devolve o estado; o cron chama de novo.
// Mesmo padrão de `disparar-pesquisa-1a-aula-auto`.
//
// NÃO duplica lógica: chama as duas edges existentes por HTTP com a service_role.
//
// ⚠️ Kill switch `automacoes_config(slug='auto_historico_professor')`, começa DESLIGADO.
// ⚠️ Trava com TTL (`fn_orquestracao_tentar_travar_v1`) — sobreposição não corrompe (as
//    escritas são upsert por chave e a finalização tem advisory lock), mas duplicaria
//    chamadas contra a API do Emusys, que tem teto de 60 req/min por IP dividido com o
//    resto da casa.
// @ts-nocheck
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN');

const SLUG_CONFIG = 'auto_historico_professor';
const CHAVE_LOCK = 'orquestrar-historico-professor';
const LOCK_TTL_SEGUNDOS = 900;

// Tem que ser IDÊNTICO ao que a reconstrução usa, senão o manifesto diverge.
const VERSAO_RECONSTRUCAO = 'periodos-professor-v1.23-disciplina-mesmo-vinculo-20260718';
const RECORTE_INICIO = '2018-01-01';
const TOTAL_PARTICOES = 32;

// ⚠️ SEM `inicio_completo: true`, TODO primeiro período de cada partição nasce
// `inicio_incompleto`. Medido em 09/08/2026 ao esquecer: 0 → 2.269, e os vínculos em
// revisão de 17 → 498. O recorte começa em 2018-01-01, que é o início real do histórico
// no Emusys — então a afirmação é verdadeira, não conveniência.
const INICIO_COMPLETO = true;

// Reler a última semana a cada dia: o Emusys edita aula retroativamente (presença lançada
// depois, reagendamento). Sem sobreposição, essas edições nunca entrariam.
const DIAS_SOBREPOSICAO = 7;

// Reconstruir todo dia seria desperdício: ela relê 2018→hoje inteiro e materializa ~8.3 mil
// períodos por vez. O histórico antigo não muda. Semanal mantém a retenção fresca o
// suficiente (o ciclo é trimestral) e segura o crescimento da tabela em 7×.
const DIAS_ENTRE_RECONSTRUCOES = 7;

// A invocação para aqui e devolve o estado; o cron continua no próximo tick.
const ORCAMENTO_MS = 95_000;

const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92' },
  { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e' },
  { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d' },
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hojeBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const diaIso = (d) => d.toISOString().slice(0, 10);

function roleDoJwt(token) {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))?.role ?? null;
  } catch {
    return null;
  }
}

// Só service_role: esta edge move dado histórico e dispara chamadas à API do Emusys.
// ⚠️ O claim só é confiável porque `verify_jwt = true` no config.toml — o gateway valida
// a ASSINATURA antes de chegar aqui. Com verify_jwt=false isto seria forjável.
// A comparação por string sozinha não basta: a service_role do `.env` pode ser de outra
// geração que a variável reservada interna (mesmo motivo comentado em
// `backfill-historico-professor-emusys`). O `x-sync-token` fica como caminho alternativo
// para quando o token do cron não for um JWT.
function origemAutorizada(req) {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return true;
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  return token === SUPABASE_SERVICE_ROLE_KEY || roleDoJwt(token) === 'service_role';
}

async function chamarEdge(nome, corpo) {
  const resposta = await fetch(`${SUPABASE_URL}/functions/v1/${nome}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, status: resposta.status, dados };
}

// ── Fase 1: backfill ────────────────────────────────────────────────────────────────
// Acha a execução aberta que cobre o recorte, ou cria uma incremental. Devolve o id
// quando houver execução `concluido` cobrindo `RECORTE_INICIO → hoje`.
async function avancarBackfill(supabase, unidade, hoje, expirou) {
  const cobre = (e) => e.data_inicio <= RECORTE_INICIO && e.data_fim >= hoje;

  const { data: execucoes, error } = await supabase
    .from('emusys_historico_backfill_execucoes_v1')
    .select('id, data_inicio, data_fim, janela_inicio_atual, janela_fim_atual, status, paginas_processadas, aulas_recebidas')
    .eq('unidade_id', unidade.id)
    .gte('data_fim', hoje)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return { fase: 'backfill', erro: `leitura_execucoes: ${error.message}` };

  const concluida = (execucoes || []).find((e) => e.status === 'concluido' && cobre(e));
  if (concluida) return { fase: 'backfill', estado: 'ja_concluido', execucao_id: concluida.id };

  // ⚠️ `pausado`/`falhou` NÃO entram: a edge de backfill lança 409
  // `EXECUCAO_REQUER_RETOMADA` para esses, e reaproveitá-las faria o cron falhar todo dia
  // para sempre. Também NÃO criamos outra por cima — isso empilharia uma linha a cada
  // tick enquanto durasse o problema. Paramos e reportamos; no dia seguinte o recorte
  // muda (`data_fim = hoje`) e o ciclo se recompõe sozinho.
  let execucao = (execucoes || []).find((e) => ['pendente', 'executando'].includes(e.status) && cobre(e));

  if (!execucao) {
    const travada = (execucoes || []).find((e) => ['pausado', 'falhou'].includes(e.status) && cobre(e));
    if (travada) {
      console.error(`[orq] ${unidade.nome}: execucao ${travada.id} em '${travada.status}' — requer retomada humana`);
      return { fase: 'backfill', estado: 'requer_retomada', execucao_id: travada.id, status_travado: travada.status };
    }
  }

  if (!execucao) {
    // Só declaramos cobrir desde 2018 se uma execução ANTERIOR já estabeleceu essa
    // cobertura (o staging é cumulativo entre execuções, nada é apagado). Isso usa a
    // escrituração do próprio pipeline em vez de adivinhar pelo formato do dado.
    //
    // ⚠️ NÃO inferir do staging ("tem aula antes de 2019?"): a Barra abriu em 09/10/2021
    // e passaria por "sem histórico", disparando uma varredura de 8 anos todo dia. Foi
    // exatamente o que a primeira versão desta função fazia — medido antes de subir.
    const { data: cobertura } = await supabase
      .from('emusys_historico_backfill_execucoes_v1')
      .select('data_fim')
      .eq('unidade_id', unidade.id).eq('status', 'concluido')
      .lte('data_inicio', RECORTE_INICIO)
      .order('data_fim', { ascending: false })
      .limit(1).maybeSingle();

    let janelaInicio = RECORTE_INICIO;
    if (cobertura?.data_fim) {
      // Recua a sobreposição: o Emusys edita aula retroativamente (presença lançada
      // depois, reagendamento) e sem isso essas edições nunca entrariam.
      const base = new Date(`${cobertura.data_fim}T12:00:00Z`);
      base.setUTCDate(base.getUTCDate() - DIAS_SOBREPOSICAO);
      janelaInicio = diaIso(base);
    }
    const fimDoMes = new Date(`${janelaInicio}T12:00:00Z`);
    const janelaFim = diaIso(new Date(Date.UTC(fimDoMes.getUTCFullYear(), fimDoMes.getUTCMonth() + 1, 0)));

    const { data: nova, error: erroInsert } = await supabase
      .from('emusys_historico_backfill_execucoes_v1')
      .insert({
        unidade_id: unidade.id,
        data_inicio: RECORTE_INICIO,
        data_fim: hoje,
        janela_inicio_atual: janelaInicio,
        janela_fim_atual: janelaFim > hoje ? hoje : janelaFim,
        status: 'pendente',
      })
      .select('id, data_inicio, data_fim, janela_inicio_atual, janela_fim_atual, status')
      .single();
    if (erroInsert) return { fase: 'backfill', erro: `criar_execucao: ${erroInsert.message}` };

    execucao = nova;
    console.log(
      `[orq] ${unidade.nome}: execucao ${nova.id} criada, janela ${janelaInicio}` +
      ` (cobertura anterior ate ${cobertura?.data_fim ?? 'nenhuma → varredura integral'})`,
    );
  }

  let chamadas = 0;
  let ultimo = execucao;
  while (!expirou()) {
    const r = await chamarEdge('backfill-historico-professor-emusys', { execucao_id: execucao.id, max_paginas: 10 });
    chamadas += 1;
    if (!r.ok) return { fase: 'backfill', execucao_id: execucao.id, chamadas, erro: `HTTP ${r.status}`, detalhe: r.dados };
    ultimo = r.dados?.execucao ?? r.dados;
    if (['concluido', 'pausado', 'falhou'].includes(ultimo?.status)) break;
    await espera(2500); // a API é 60 req/min por IP e a casa inteira usa o mesmo IP
  }

  return {
    fase: 'backfill',
    execucao_id: execucao.id,
    estado: ultimo?.status ?? 'em_andamento',
    chamadas,
    paginas: ultimo?.paginas_processadas,
    aulas: ultimo?.aulas_recebidas,
    janela_fim: ultimo?.janela_fim_atual,
  };
}

// ── Fase 2: reconstrução ────────────────────────────────────────────────────────────
async function avancarReconstrucao(supabase, unidade, hoje, execucaoBackfillId, expirou) {
  const { data: ultima } = await supabase
    .from('professor_periodos_reconstrucoes_v1')
    .select('id, data_fim, concluido_em')
    .eq('unidade_id', unidade.id).eq('status', 'concluido')
    .order('data_fim', { ascending: false }).order('concluido_em', { ascending: false })
    .limit(1).maybeSingle();

  if (ultima?.concluido_em) {
    const dias = (Date.now() - new Date(ultima.concluido_em).getTime()) / 86_400_000;
    if (dias < DIAS_ENTRE_RECONSTRUCOES) {
      return { fase: 'reconstrucao', estado: 'nao_vencida', dias_desde_ultima: Math.round(dias * 10) / 10 };
    }
  }

  // Quais partições já fecharam para ESTA chave (unidade+recorte+versão+backfill+total).
  const { data: prontas } = await supabase
    .from('professor_periodos_reconstrucao_particoes_v1')
    .select('particao_indice')
    .eq('unidade_id', unidade.id).eq('data_inicio', RECORTE_INICIO).eq('data_fim', hoje)
    .eq('versao_reconstrucao', VERSAO_RECONSTRUCAO).eq('execucao_backfill_id', execucaoBackfillId)
    .eq('total_particoes', TOTAL_PARTICOES).eq('status', 'concluido');
  const feitas = new Set((prontas || []).map((p) => p.particao_indice));

  let processadas = 0;
  let ultimoResumo = null;
  for (let indice = 0; indice < TOTAL_PARTICOES; indice += 1) {
    if (feitas.has(indice)) continue;
    if (expirou()) break;
    const r = await chamarEdge('reconstruir-periodos-professor', {
      unidade_id: unidade.id,
      data_inicio: RECORTE_INICIO,
      data_fim: hoje,
      versao_reconstrucao: VERSAO_RECONSTRUCAO,
      execucao_backfill_id: execucaoBackfillId,
      inicio_completo: INICIO_COMPLETO,
      evidencia_inicio_completo:
        `Recorte integral Emusys ${RECORTE_INICIO} a ${hoje}; staging mantido pelo backfill incremental diario (orquestrar-historico-professor).`,
      particao_total: TOTAL_PARTICOES,
      particao_indice: indice,
    });
    if (!r.ok) return { fase: 'reconstrucao', processadas, erro: `particao ${indice}: HTTP ${r.status}`, detalhe: r.dados };
    processadas += 1;
    ultimoResumo = r.dados?.resumo ?? null;
    await espera(400);
  }

  const restantes = TOTAL_PARTICOES - feitas.size - processadas;
  return {
    fase: 'reconstrucao',
    estado: restantes > 0 ? 'em_andamento' : 'ciclo_fechado',
    processadas, ja_prontas: feitas.size, restantes,
    resumo: ultimoResumo,
  };
}

async function executarCiclo(supabase, opcoes) {
  const inicio = Date.now();
  const expirou = () => Date.now() - inicio > ORCAMENTO_MS;
  const hoje = hojeBRT();
  const relatorio = [];

  for (const unidade of UNIDADES) {
    if (opcoes.unidadeId && unidade.id !== opcoes.unidadeId) continue;
    if (expirou()) { relatorio.push({ unidade: unidade.nome, estado: 'orcamento_esgotado' }); continue; }

    const bf = await avancarBackfill(supabase, unidade, hoje, expirou);
    const passo = { unidade: unidade.nome, backfill: bf };

    if (!bf.erro && bf.execucao_id && (bf.estado === 'concluido' || bf.estado === 'ja_concluido')) {
      passo.reconstrucao = opcoes.pularReconstrucao
        ? { fase: 'reconstrucao', estado: 'pulada_por_parametro' }
        : await avancarReconstrucao(supabase, unidade, hoje, bf.execucao_id, expirou);
    } else if (!bf.erro) {
      passo.reconstrucao = { fase: 'reconstrucao', estado: 'aguardando_backfill' };
    }
    relatorio.push(passo);
  }

  return { hoje, duracao_ms: Date.now() - inicio, relatorio };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!origemAutorizada(req)) return json({ ok: false, erro: 'nao autorizado' }, 401);

  let body = {};
  try { body = await req.json(); } catch { /* cron manda body vazio */ }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: cfg } = await supabase
    .from('automacoes_config').select('ativo').eq('slug', SLUG_CONFIG).maybeSingle();
  if (cfg?.ativo !== true && body.forcar !== true) {
    return json({ ok: true, executou: false, motivo: 'auto_desligado' });
  }

  const { data: travou, error: erroLock } = await supabase.rpc('fn_orquestracao_tentar_travar_v1', {
    p_chave: CHAVE_LOCK, p_ttl_segundos: LOCK_TTL_SEGUNDOS, p_dono: new Date().toISOString(),
  });
  if (erroLock) return json({ ok: false, erro: `lock: ${erroLock.message}` }, 500);
  if (travou !== true) return json({ ok: true, executou: false, motivo: 'ja_em_execucao' });

  const opcoes = {
    unidadeId: body.unidade_id ?? null,
    pularReconstrucao: body.pular_reconstrucao === true,
  };

  const soltarTrava = () => supabase.rpc('fn_orquestracao_destravar_v1', { p_chave: CHAVE_LOCK });

  // `aguardar: true` roda síncrono e devolve o relatório (validação manual).
  // Default: responde na hora e continua em background — o cron não espera.
  if (body.aguardar === true) {
    try {
      const resultado = await executarCiclo(supabase, opcoes);
      return json({ ok: true, executou: true, ...resultado });
    } finally {
      await soltarTrava();
    }
  }

  EdgeRuntime.waitUntil((async () => {
    try {
      const resultado = await executarCiclo(supabase, opcoes);
      console.log('[orq] ciclo:', JSON.stringify(resultado));
    } catch (e) {
      console.error('[orq] falhou:', e);
    } finally {
      await soltarTrava();
    }
  })());

  return json({ ok: true, executou: true, modo: 'background' });
});
