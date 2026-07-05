// Edge Function: meta-ads-insights
// Proxy read-only da Meta Ads Insights API para o módulo Meta Ads do frontend.
// O token fica em secret (META_ADS_TOKEN) — o frontend NUNCA vê o token.
// Body: { "date_preset": "last_7d" | "last_30d" | "last_90d" | "maximum" } (default last_30d)
// Retorna: { conta: {...}, campanhas: [...] } com spend/impressions/clicks/cpm/ctr/actions.

const GRAPH = 'https://graph.facebook.com/v21.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRESETS_VALIDOS = new Set(['today', 'yesterday', 'last_7d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']);
const FIELDS = 'spend,impressions,clicks,cpm,ctr,actions';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const token = Deno.env.get('META_ADS_TOKEN');
    const account = Deno.env.get('META_AD_ACCOUNT_ID') ?? 'act_899158124847003';
    if (!token) return json({ ok: false, error: 'META_ADS_TOKEN não configurado' }, 500);

    const body = await req.json().catch(() => ({}));
    const preset = PRESETS_VALIDOS.has(body?.date_preset) ? body.date_preset : 'last_30d';

    const [contaResp, campResp] = await Promise.all([
      fetch(`${GRAPH}/${account}/insights?fields=${FIELDS}&date_preset=${preset}&access_token=${token}`),
      fetch(`${GRAPH}/${account}/insights?level=campaign&fields=campaign_id,campaign_name,${FIELDS}&date_preset=${preset}&limit=50&access_token=${token}`),
    ]);
    const [contaJson, campJson] = await Promise.all([contaResp.json(), campResp.json()]);

    if (contaJson.error || campJson.error) {
      const err = contaJson.error ?? campJson.error;
      console.error('[meta-ads-insights] Graph API error:', err);
      return json({ ok: false, error: err.message ?? 'erro na Graph API' }, 502);
    }

    return json({
      ok: true,
      date_preset: preset,
      conta: contaJson.data?.[0] ?? null,
      campanhas: campJson.data ?? [],
    });
  } catch (e) {
    console.error('[meta-ads-insights]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
