// Edge Function: chatwoot-atendimento-insights
// Proxy read-only da performance de atendimento do Chatwoot para a sub-aba "Atendimento"
// (Analytics → Comercial). O token fica em secret (CHATWOOT_API_TOKEN) — o frontend NUNCA vê.
// Body: { "ano": number, "mesInicio": number, "mesFim": number }
//
// ⚠️ NÃO usa summary_reports/*: aquele endpoint tira a MÉDIA de eventos ocorridos no período,
// então uma conversa criada meses antes e respondida agora entra com "1ª resposta" de centenas
// de horas, inflando tudo (ex.: Vitória dava ~5 dias no summary; real ~poucas horas).
//
// Metodologia: varremos as conversas CRIADAS no período. Para cada uma que teve resposta humana,
// lemos o evento `first_response` do Chatwoot (endpoint reporting_events). Esse evento mede o
// tempo do HANDOFF (quando a conversa é aberta/passada ao humano) até a 1ª resposta do agente —
// ou seja, NÃO conta a janela em que o bot SDR (Mila) segurou o lead, nem a madrugada antes de
// alguém assumir. É o número honesto de "quanto o humano demora depois que a bola chega nele".
// Agregamos por MEDIANA (resistente a leads parados). Conversas 100% atendidas pelo bot (sem
// resposta humana) e eventos com valor 0 (conversa iniciada pelo agente, sem espera do lead)
// não entram na mediana.
//
// Também devolvemos o TEMPO MÉDIO DE RESPOSTA (mediana dos eventos `reply_time` — cada turno
// lead→resposta de agente humano), que já vem no mesmo GET reporting_events (custo de API zero
// a mais). first_response = velocidade de PEGAR o lead; reply_time = ritmo AO LONGO da conversa.
// Tudo ao vivo, nada persistido.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BRT_OFFSET_SEGUNDOS = 3 * 60 * 60; // dia 1 00:00 BRT = 03:00 UTC
const MAX_PAGINAS = 60;       // trava de segurança (60 * 25 = 1500 conversas/mês)
const CONCORRENCIA_EVENTOS = 12; // buscas de reporting_events em paralelo
const MAX_EVENTOS = 600;      // teto de conversas com resposta humana a inspecionar/mês

function epochInicioMesBRT(ano: number, mes: number): number {
  return Date.UTC(ano, mes - 1, 1) / 1000 + BRT_OFFSET_SEGUNDOS;
}
function clampMes(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : fallback;
}
function dataUTC(epochSeg: number): string {
  return new Date(epochSeg * 1000).toISOString().slice(0, 10);
}

// Infere a unidade pelo nome da caixa. null = global/sem unidade (ex.: instagram, Sol).
function unidadeDaCaixa(nome: string): string | null {
  const n = nome.toLowerCase();
  if (n.includes('recreio')) return 'Recreio';
  if (n.includes('barra')) return 'Barra';
  if (/(^|[^a-z])cg([^a-z]|$)/.test(n) || n.includes('campo grande')) return 'CG';
  return null;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Executa fn sobre os itens com no máximo `limite` chamadas simultâneas.
async function mapComLimite<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let i = 0;
  const worker = async () => {
    while (i < itens.length) {
      const idx = i++;
      resultados[idx] = await fn(itens[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, () => worker()));
  return resultados;
}

type Named = { id: number; name?: string | null; available_name?: string | null };
type Conversa = {
  id?: number;
  created_at?: number;
  first_reply_created_at?: number;
  status?: string;
  inbox_id?: number;
  meta?: { assignee?: { id?: number } | null };
};
type ReportingEvent = { name?: string; value?: number; user_id?: number | null };

// Acumulador por chave de grupo (agente/caixa/unidade).
// gaps = 1ª resposta (evento first_response); respostas = cada turno lead→resposta (reply_time).
type Grupo = { conversas: number; resolvidas: number; gaps: number[]; respostas: number[] };
const novoGrupo = (): Grupo => ({ conversas: 0, resolvidas: 0, gaps: [], respostas: [] });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const baseUrl = Deno.env.get('CHATWOOT_URL');
    const accountId = Deno.env.get('CHATWOOT_ACCOUNT_ID');
    const token = Deno.env.get('CHATWOOT_API_TOKEN');
    if (!baseUrl || !accountId || !token) {
      return json({ ok: false, error: 'Credenciais do Chatwoot não configuradas (CHATWOOT_URL/CHATWOOT_ACCOUNT_ID/CHATWOOT_API_TOKEN)' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const agora = new Date();
    const ano = Number.isFinite(Number(body?.ano)) ? Math.trunc(Number(body.ano)) : agora.getUTCFullYear();
    const mesInicio = clampMes(body?.mesInicio, agora.getUTCMonth() + 1);
    const mesFim = Math.max(mesInicio, clampMes(body?.mesFim, mesInicio));

    // Janela [since, until) em epoch (BRT). O recorte fino é feito na edge; o filtro da API
    // usa datas com 1 dia de margem (compara data UTC) para não perder nada nas bordas.
    const since = epochInicioMesBRT(ano, mesInicio);
    const until = mesFim >= 12 ? epochInicioMesBRT(ano + 1, 1) : epochInicioMesBRT(ano, mesFim + 1);
    const dataDe = dataUTC(since - 86400);
    const dataAte = dataUTC(until + 86400);

    const headers = { api_access_token: token, 'Content-Type': 'application/json' };
    const getJson = (u: string) => fetch(u, { headers: { api_access_token: token } }).then((r) => r.json());

    // Nomes de agentes e caixas (para rótulos + unidade).
    const nomes = (lista: unknown): Map<number, string> => {
      const arr: Named[] = Array.isArray(lista) ? lista as Named[] : ((lista as { payload?: Named[] })?.payload ?? []);
      const m = new Map<number, string>();
      for (const x of arr) m.set(x.id, (x.available_name ?? x.name ?? `#${x.id}`).trim());
      return m;
    };
    const [agentesRaw, caixasRaw] = await Promise.all([
      getJson(`${baseUrl}/api/v1/accounts/${accountId}/agents`),
      getJson(`${baseUrl}/api/v1/accounts/${accountId}/inboxes`),
    ]);
    const nomeAgente = nomes(agentesRaw);
    const nomeCaixa = nomes(caixasRaw);

    // Varre as conversas criadas no período (paginado).
    const filtro = {
      payload: [
        { attribute_key: 'created_at', filter_operator: 'is_greater_than', values: [dataDe], query_operator: 'AND' },
        { attribute_key: 'created_at', filter_operator: 'is_less_than', values: [dataAte], query_operator: null },
      ],
    };
    const conversas: Conversa[] = [];
    let truncConversas = false; // atingiu MAX_PAGINAS com página cheia → há conversas não lidas
    for (let pg = 1; pg <= MAX_PAGINAS; pg++) {
      const resp = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations/filter?page=${pg}`, {
        method: 'POST', headers, body: JSON.stringify(filtro),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        console.error('[chatwoot-atendimento-insights] filter erro', resp.status, txt);
        return json({ ok: false, error: `Chatwoot retornou ${resp.status} ao listar conversas` }, 502);
      }
      const data = await resp.json();
      const itens: Conversa[] = data?.payload ?? [];
      conversas.push(...itens);
      if (itens.length < 25) break;
      if (pg === MAX_PAGINAS) truncConversas = true; // parou no teto, ainda havia página cheia
    }

    // Só as conversas realmente criadas no mês (recorte fino BRT).
    const doMesBruto = conversas.filter((c) => {
      const created = c.created_at ?? 0;
      return created >= since && created < until;
    });

    // Performance de atendimento HUMANO das unidades: só caixas que mapeiam para uma unidade
    // (CG/Recreio/Barra). Caixas sem unidade — Instagram (bot) e Sol-Atendimento (adm) — ficam
    // FORA de tudo: contagem, medianas e breakdown. Assim o `geral` = soma das unidades por
    // construção (headline e contagens sempre no mesmo universo). (decisão 2026-07-12)
    const doMes = doMesBruto.filter((c) =>
      typeof c.inbox_id === 'number' && unidadeDaCaixa(nomeCaixa.get(c.inbox_id) ?? '') !== null
    );

    // Passo 1 — volume por agente/caixa/unidade (conversas de unidade do mês, com ou sem humano).
    const geral = novoGrupo();
    const porAgente = new Map<number, Grupo>();
    const porCaixa = new Map<number, Grupo>();
    const porUnidade = new Map<string, Grupo>();
    const grupo = (map: Map<string | number, Grupo>, chave: string | number): Grupo => {
      const g = map.get(chave) ?? novoGrupo();
      map.set(chave, g);
      return g;
    };
    for (const c of doMes) {
      const resolvida = c.status === 'resolved';
      geral.conversas += 1;
      if (resolvida) geral.resolvidas += 1;
      const agenteId = c.meta?.assignee?.id;
      if (typeof agenteId === 'number') {
        const g = grupo(porAgente as Map<string | number, Grupo>, agenteId);
        g.conversas += 1; if (resolvida) g.resolvidas += 1;
      }
      if (typeof c.inbox_id === 'number') {
        const gc = grupo(porCaixa as Map<string | number, Grupo>, c.inbox_id);
        gc.conversas += 1; if (resolvida) gc.resolvidas += 1;
        const uni = unidadeDaCaixa(nomeCaixa.get(c.inbox_id) ?? '');
        if (uni) { const gu = grupo(porUnidade as Map<string | number, Grupo>, uni); gu.conversas += 1; if (resolvida) gu.resolvidas += 1; }
      }
    }

    // Passo 2 — tempo até a 1ª resposta HUMANA via evento first_response (relativo ao handoff).
    // Só busca evento das conversas que tiveram resposta humana (first_reply_created_at > 0).
    const comRespostaTodas = doMes
      .filter((c) => typeof c.id === 'number' && (c.first_reply_created_at ?? 0) > 0);
    const comResposta = comRespostaTodas.slice(0, MAX_EVENTOS);
    const truncEventos = comRespostaTodas.length > MAX_EVENTOS; // medianas sobre amostra parcial

    // Para cada conversa com resposta humana, no MESMO GET reporting_events já vêm a 1ª resposta
    // (first_response) e cada turno lead→resposta (reply_time, só de agente humano → tem user_id).
    // Ou seja, o tempo médio de resposta não custa nenhuma chamada de API extra.
    const valores = await mapComLimite(comResposta, CONCORRENCIA_EVENTOS, async (c) => {
      try {
        const evts = await getJson(`${baseUrl}/api/v1/accounts/${accountId}/conversations/${c.id}/reporting_events`);
        const arr: ReportingEvent[] = Array.isArray(evts) ? evts : [];
        const fr = arr.find((e) => e?.name === 'first_response');
        const v = Number(fr?.value);
        // valor <= 0 = conversa iniciada pelo agente / sem espera real do lead → fora da mediana.
        const primeira = Number.isFinite(v) && v > 0 ? v : null;
        const respostas = arr
          .filter((e) => e?.name === 'reply_time' && typeof e?.user_id === 'number')
          .map((e) => Number(e?.value))
          .filter((x) => Number.isFinite(x) && x > 0);
        return { primeira, respostas };
      } catch {
        return { primeira: null as number | null, respostas: [] as number[] };
      }
    });

    // Distribui um valor no campo escolhido (gaps=1ª resposta, respostas=tempo de resposta) para
    // geral + agente (assignee) + caixa (inbox) + unidade da conversa.
    const distribuir = (c: Conversa, campo: 'gaps' | 'respostas', valor: number) => {
      geral[campo].push(valor);
      const agenteId = c.meta?.assignee?.id;
      if (typeof agenteId === 'number') grupo(porAgente as Map<string | number, Grupo>, agenteId)[campo].push(valor);
      if (typeof c.inbox_id === 'number') {
        grupo(porCaixa as Map<string | number, Grupo>, c.inbox_id)[campo].push(valor);
        const uni = unidadeDaCaixa(nomeCaixa.get(c.inbox_id) ?? '');
        if (uni) grupo(porUnidade as Map<string | number, Grupo>, uni)[campo].push(valor);
      }
    };
    comResposta.forEach((c, idx) => {
      const { primeira, respostas } = valores[idx];
      if (primeira != null) distribuir(c, 'gaps', primeira);
      for (const r of respostas) distribuir(c, 'respostas', r);
    });

    const montar = <T>(map: Map<string | number, Grupo>, meta: (chave: string | number) => T) =>
      Array.from(map.entries())
        .filter(([, g]) => g.conversas > 0)
        .map(([chave, g]) => ({
          ...meta(chave),
          conversas: g.conversas,
          resolvidas: g.resolvidas,
          primeiraRespostaMedianaSeg: mediana(g.gaps),
          amostraPrimeiraResposta: g.gaps.length,
          tempoRespostaMedianaSeg: mediana(g.respostas),
          amostraTempoResposta: g.respostas.length,
        }))
        .sort((a, b) => b.conversas - a.conversas);

    const agentes = montar(porAgente as Map<string | number, Grupo>, (id) => ({
      id: id as number, nome: nomeAgente.get(id as number) ?? `Agente ${id}`,
    }));
    const caixas = montar(porCaixa as Map<string | number, Grupo>, (id) => {
      const nome = nomeCaixa.get(id as number) ?? `Caixa ${id}`;
      return { id: id as number, nome, unidade: unidadeDaCaixa(nome) };
    });
    const unidades = montar(porUnidade as Map<string | number, Grupo>, (nome) => ({
      id: nome as string, nome: nome as string,
    }));

    const resumoGeral = {
      conversas: geral.conversas,
      resolvidas: geral.resolvidas,
      primeiraRespostaMedianaSeg: mediana(geral.gaps),
      amostraPrimeiraResposta: geral.gaps.length,
      tempoRespostaMedianaSeg: mediana(geral.respostas),
      amostraTempoResposta: geral.respostas.length,
    };

    return json({
      ok: true, since, until, geral: resumoGeral, agentes, caixas, unidades,
      truncado: { conversas: truncConversas, eventos: truncEventos },
    });
  } catch (e) {
    console.error('[chatwoot-atendimento-insights]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
