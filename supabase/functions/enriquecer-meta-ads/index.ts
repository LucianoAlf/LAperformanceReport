// Edge Function: enriquecer-meta-ads
// Enriquece meta_ads_cache com metadados dos anúncios Meta (nome, campanha, adset)
// para todo leads.meta_ad_source_id ainda não cacheado (ou com erro anterior).
// Disparo: cron diário + manual (POST vazio, ou {"source_ids": ["..."]} pra forçar).
// Token: secret META_ADS_TOKEN (usar token read-only ads_read quando disponível).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v21.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const token = Deno.env.get('META_ADS_TOKEN');
    if (!token) return json({ ok: false, error: 'META_ADS_TOKEN não configurado' }, 500);

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    let sourceIds: string[] = Array.isArray(body?.source_ids) ? body.source_ids.map(String) : [];

    if (sourceIds.length === 0) {
      // source_ids presentes em leads mas ausentes (ou com erro) no cache
      const { data: pendentes, error } = await supabase.rpc('listar_meta_source_ids_pendentes');
      if (error) throw error;
      sourceIds = (pendentes ?? []).map((r: { source_id: string }) => r.source_id);
    }

    sourceIds = [...new Set(sourceIds)].slice(0, 50); // cap defensivo por execução
    if (sourceIds.length === 0) return json({ ok: true, enriquecidos: 0, msg: 'nada pendente' });

    let okCount = 0, errCount = 0;
    for (const id of sourceIds) {
      const resp = await fetch(
        `${GRAPH}/${encodeURIComponent(id)}?fields=name,effective_status,campaign{id,name},adset{id,name}&access_token=${token}`,
      );
      const data = await resp.json();

      if (!resp.ok || data.error) {
        errCount++;
        await supabase.from('meta_ads_cache').upsert({
          source_id: id,
          erro: data?.error?.message ?? `HTTP ${resp.status}`,
          enriquecido_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        continue;
      }

      okCount++;
      await supabase.from('meta_ads_cache').upsert({
        source_id: id,
        ad_name: data.name ?? null,
        adset_id: data.adset?.id ?? null,
        adset_name: data.adset?.name ?? null,
        campaign_id: data.campaign?.id ?? null,
        campaign_name: data.campaign?.name ?? null,
        effective_status: data.effective_status ?? null,
        erro: null,
        enriquecido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return json({ ok: true, enriquecidos: okCount, erros: errCount, processados: sourceIds.length });
  } catch (e) {
    console.error('[enriquecer-meta-ads]', e);
    return json({ ok: false, error: e instanceof Error ? e.message : 'erro interno' }, 500);
  }
});
