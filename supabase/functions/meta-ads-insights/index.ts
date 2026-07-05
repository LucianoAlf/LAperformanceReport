// Edge Function: meta-ads-insights
// Proxy read-only da Meta Ads Insights API para o módulo Tráfego Pago do frontend.
// O token fica em secret (META_ADS_TOKEN) — o frontend NUNCA vê o token.
// Acesso restrito: só e-mails em EMAILS_AUTORIZADOS (custo de mídia sensível).
// Body: { "date_preset": "last_7d" | "last_30d" | "last_90d" | "maximum" } (default last_30d)
// Retorna conta + campanhas + tendência diária + por anúncio + posicionamento +
// demográfico + região. Tudo ao vivo — nada é persistido.

const GRAPH = 'https://graph.facebook.com/v21.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Custo de mídia é sensível: só estes e-mails podem consultar (espelha o guard do frontend).
const EMAILS_AUTORIZADOS = new Set(['hugo@gmail.com', 'lucianoalf.la@gmail.com']);

// Extrai o email do payload do JWT (assinatura já validada pelo verify_jwt do gateway).
function emailDoJwt(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (payload.email ?? payload.user_metadata?.email ?? null)?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

const PRESETS_VALIDOS = new Set(['today', 'yesterday', 'last_7d', 'last_30d', 'last_90d', 'this_month', 'last_month', 'maximum']);
const FIELDS = 'spend,impressions,clicks,cpm,ctr,actions';

// Conversa iniciada via clique no anúncio (messaging conversation started).
const ACAO_CONVERSA = 'onsite_conversion.messaging_conversation_started_7d';

type Action = { action_type: string; value: string };
function conversasDe(actions?: Action[]): number {
  if (!Array.isArray(actions)) return 0;
  const a = actions.find((x) => x.action_type === ACAO_CONVERSA);
  return a ? Number(a.value) : 0;
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Gate de autorização por e-mail (além do verify_jwt do gateway).
  const email = emailDoJwt(req.headers.get('authorization'));
  if (!email || !EMAILS_AUTORIZADOS.has(email)) {
    return json({ ok: false, error: 'acesso não autorizado' }, 403);
  }

  try {
    const token = Deno.env.get('META_ADS_TOKEN');
    const account = Deno.env.get('META_AD_ACCOUNT_ID') ?? 'act_899158124847003';
    if (!token) return json({ ok: false, error: 'META_ADS_TOKEN não configurado' }, 500);

    const body = await req.json().catch(() => ({}));
    const preset = PRESETS_VALIDOS.has(body?.date_preset) ? body.date_preset : 'last_30d';
    const base = `${GRAPH}/${account}/insights`;
    const auth = `date_preset=${preset}&access_token=${token}`;

    const url = (extra: string) => `${base}?${extra}&${auth}`;
    const getJson = (u: string) => fetch(u).then((r) => r.json());

    // 7 consultas em paralelo — cada breakdown é uma chamada separada na Graph API.
    const [conta, camp, tend, ads, posic, demo, reg] = await Promise.all([
      getJson(url(`fields=${FIELDS},reach,frequency`)),
      getJson(url(`level=campaign&fields=campaign_id,campaign_name,${FIELDS}&limit=50`)),
      getJson(url(`fields=spend,impressions,clicks,actions&time_increment=1`)),
      getJson(url(`level=ad&fields=ad_id,ad_name,${FIELDS}&limit=25`)),
      getJson(url(`fields=spend,impressions,clicks,actions&breakdowns=publisher_platform,platform_position`)),
      getJson(url(`fields=spend,impressions,actions&breakdowns=age,gender`)),
      getJson(url(`fields=spend,impressions,actions&breakdowns=region&limit=30`)),
    ]);

    const primeiroErro = [conta, camp, tend, ads, posic, demo, reg].find((r) => r?.error)?.error;
    if (primeiroErro) {
      console.error('[meta-ads-insights] Graph API error:', primeiroErro);
      return json({ ok: false, error: primeiroErro.message ?? 'erro na Graph API' }, 502);
    }

    const contaRow = conta.data?.[0] ?? null;

    // Thumbnails dos anúncios: uma chamada batch por ids (creative.thumbnail_url).
    const adRows = (ads.data ?? []).map((a: Record<string, unknown>) => ({
      ad_id: a.ad_id,
      ad_name: a.ad_name,
      spend: num(a.spend),
      impressions: num(a.impressions),
      clicks: num(a.clicks),
      ctr: num(a.ctr),
      conversas: conversasDe(a.actions as Action[]),
      thumbnail: null as string | null,
    })).sort((x: { spend: number }, y: { spend: number }) => y.spend - x.spend).slice(0, 12);

    if (adRows.length) {
      const ids = adRows.map((a: { ad_id: unknown }) => a.ad_id).join(',');
      const thumbs = await getJson(`${GRAPH}/?ids=${ids}&fields=creative{thumbnail_url}&access_token=${token}`)
        .catch(() => ({}));
      for (const a of adRows) {
        const t = thumbs?.[a.ad_id as string]?.creative?.thumbnail_url;
        if (t) a.thumbnail = t;
      }
    }

    return json({
      ok: true,
      date_preset: preset,
      conta: contaRow,
      campanhas: camp.data ?? [],
      tendencia: (tend.data ?? []).map((d: Record<string, unknown>) => ({
        data: d.date_start,
        spend: num(d.spend),
        clicks: num(d.clicks),
        conversas: conversasDe(d.actions as Action[]),
      })),
      anuncios: adRows,
      posicionamento: (posic.data ?? []).map((d: Record<string, unknown>) => ({
        plataforma: d.publisher_platform,
        posicao: d.platform_position,
        spend: num(d.spend),
        impressions: num(d.impressions),
        clicks: num(d.clicks),
        conversas: conversasDe(d.actions as Action[]),
      })).sort((a: { spend: number }, b: { spend: number }) => b.spend - a.spend),
      demografico: (demo.data ?? []).map((d: Record<string, unknown>) => ({
        idade: d.age,
        genero: d.gender,
        spend: num(d.spend),
        impressions: num(d.impressions),
        conversas: conversasDe(d.actions as Action[]),
      })),
      regiao: (reg.data ?? []).map((d: Record<string, unknown>) => ({
        regiao: d.region ?? 'Desconhecida',
        spend: num(d.spend),
        impressions: num(d.impressions),
        conversas: conversasDe(d.actions as Action[]),
      })).sort((a: { spend: number }, b: { spend: number }) => b.spend - a.spend),
    });
  } catch (e) {
    console.error('[meta-ads-insights]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
