// Consulta o custo real por mensagem (últimos 90 dias) direto na Meta Graph API
// (pricing_analytics), por categoria de template. Sem cache — sempre ao vivo.

const GRAPH_VERSION = 'v21.0'
const JANELA_DIAS = 90

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

  try {
    const { numero_meta_id } = await req.json()
    if (!numero_meta_id) {
      return new Response(JSON.stringify({ error: 'numero_meta_id é obrigatório' }), { status: 400, headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const numeroRes = await fetch(
      `${supabaseUrl}/rest/v1/numeros_meta?id=eq.${numero_meta_id}&select=waba_id,access_token,custo_por_categoria`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    )
    const numeroRows = await numeroRes.json()
    const numero = numeroRows?.[0]
    if (!numero?.waba_id || !numero?.access_token) {
      return new Response(JSON.stringify({ error: 'Número Meta não encontrado ou sem credenciais' }), { status: 404, headers: corsHeaders })
    }

    const end = Math.floor(Date.now() / 1000)
    const start = end - JANELA_DIAS * 24 * 3600

    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(MONTHLY).dimensions(["PRICING_CATEGORY","PRICING_TYPE"])`
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${numero.waba_id}?fields=${encodeURIComponent(fields)}&access_token=${numero.access_token}`

    const metaRes = await fetch(url)
    const metaData = await metaRes.json()

    if (metaData.error) {
      return new Response(JSON.stringify({ error: `Meta API: ${metaData.error.message}` }), { status: 502, headers: corsHeaders })
    }

    const pontos = metaData?.pricing_analytics?.data?.[0]?.data_points ?? []

    // Agrega volume/custo por categoria, só tipo REGULAR (mensagens efetivamente cobradas)
    const agregados: Record<string, { volume: number; cost: number }> = {}
    for (const p of pontos) {
      if (p.pricing_type !== 'REGULAR') continue
      const cat = String(p.pricing_category).toLowerCase()
      if (!agregados[cat]) agregados[cat] = { volume: 0, cost: 0 }
      agregados[cat].volume += p.volume
      agregados[cat].cost += p.cost
    }

    const fallback = numero.custo_por_categoria ?? { marketing: 0.5, utility: 0.15, authentication: 0.25 }
    const categorias: Record<string, { rate: number; volume: number; cost: number; fonte: 'meta_live' | 'fallback_configurado' }> = {}
    for (const cat of ['marketing', 'utility', 'authentication']) {
      const a = agregados[cat]
      if (a && a.volume > 0) {
        categorias[cat] = { rate: a.cost / a.volume, volume: a.volume, cost: a.cost, fonte: 'meta_live' }
      } else {
        categorias[cat] = { rate: fallback[cat] ?? 0.5, volume: 0, cost: 0, fonte: 'fallback_configurado' }
      }
    }

    return new Response(JSON.stringify({
      moeda: 'USD',
      janela_dias: JANELA_DIAS,
      categorias,
      atualizado_em: new Date().toISOString(),
    }), { headers: corsHeaders })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders })
  }
})
