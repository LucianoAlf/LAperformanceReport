// Edge Function: chatwoot-atendimento-insights
// Proxy read-only do relatório de performance por agente do Chatwoot para a sub-aba
// "Atendimento" (Analytics → Comercial). O token fica em secret (CHATWOOT_API_TOKEN) —
// o frontend NUNCA vê o token.
// Body: { "ano": number, "mesInicio": number, "mesFim": number }
// Retorna, por agente com atividade no período: conversas atribuídas, resolvidas e os
// tempos médios (1ª resposta, resposta, resolução) em segundos. Tudo ao vivo — nada é
// persistido (métricas voláteis, mesmo racional do meta-ads-insights).
//
// ⚠️ O endpoint summary_reports/agent do Chatwoot IGNORA filtro de inbox — sempre agrega a
// conta inteira. Por isso a sub-aba mostra dado da conta toda, não por unidade.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Offset BRT (UTC-3): dia 1 de mês às 00:00 BRT = 03:00 UTC.
const BRT_OFFSET_SEGUNDOS = 3 * 60 * 60;

// Epoch (segundos, UTC) da meia-noite BRT do dia 1 de (ano, mes). mes é 1-based.
function epochInicioMesBRT(ano: number, mes: number): number {
  const utcMeiaNoite = Date.UTC(ano, mes - 1, 1) / 1000;
  return utcMeiaNoite + BRT_OFFSET_SEGUNDOS;
}

function clampMes(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : fallback;
}

type AgentSummary = {
  id: number;
  conversations_count: number;
  resolved_conversations_count: number;
  avg_resolution_time: number | null;
  avg_first_response_time: number | null;
  avg_reply_time: number | null;
};

type Agent = { id: number; name?: string | null; available_name?: string | null };

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

    // Janela [since, until): início do mesInicio até início do mês seguinte ao mesFim.
    const since = epochInicioMesBRT(ano, mesInicio);
    const until = mesFim >= 12
      ? epochInicioMesBRT(ano + 1, 1)
      : epochInicioMesBRT(ano, mesFim + 1);

    const headers = { api_access_token: token };
    const getJson = (u: string) => fetch(u, { headers }).then((r) => r.json());

    // 2 chamadas em paralelo: métricas por agente + nomes atuais dos agentes.
    const [resumo, agentes] = await Promise.all([
      getJson(`${baseUrl}/api/v2/accounts/${accountId}/summary_reports/agent?since=${since}&until=${until}`),
      getJson(`${baseUrl}/api/v1/accounts/${accountId}/agents`),
    ]);

    if (!Array.isArray(resumo)) {
      console.error('[chatwoot-atendimento-insights] resposta inesperada do summary:', resumo);
      return json({ ok: false, error: (resumo as { message?: string })?.message ?? 'erro ao consultar o Chatwoot' }, 502);
    }

    const listaAgentes: Agent[] = Array.isArray(agentes) ? agentes : (agentes?.payload ?? []);
    const nomePorId = new Map<number, string>();
    for (const a of listaAgentes) {
      nomePorId.set(a.id, (a.available_name ?? a.name ?? `Agente ${a.id}`).trim());
    }

    const linhas = (resumo as AgentSummary[])
      .filter((r) => (r.conversations_count ?? 0) > 0 || (r.resolved_conversations_count ?? 0) > 0)
      .map((r) => ({
        id: r.id,
        nome: nomePorId.get(r.id) ?? `Agente ${r.id}`,
        conversas: r.conversations_count ?? 0,
        resolvidas: r.resolved_conversations_count ?? 0,
        avgFirstResponseTime: r.avg_first_response_time ?? null,
        avgReplyTime: r.avg_reply_time ?? null,
        avgResolutionTime: r.avg_resolution_time ?? null,
      }))
      .sort((a, b) => b.conversas - a.conversas);

    return json({ ok: true, since, until, agentes: linhas });
  } catch (e) {
    console.error('[chatwoot-atendimento-insights]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
