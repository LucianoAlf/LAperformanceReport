-- Cache de metadados de anuncio Meta (Graph API), chaveado pelo source_id capturado
-- nos leads (leads.meta_ad_source_id). Evita rechamar a Graph API pra cada lead do
-- mesmo anuncio. Populada pela edge function enriquecer-meta-ads (cron diario).
CREATE TABLE meta_ads_cache (
  source_id text PRIMARY KEY,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  effective_status text,
  enriquecido_em timestamptz,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE meta_ads_cache IS 'Metadados de anuncios Meta (nome, campanha, adset) por source_id, enriquecidos via Graph API pela edge enriquecer-meta-ads. Join: leads.meta_ad_source_id = meta_ads_cache.source_id. Metricas vivas (gasto/CTR) NAO ficam aqui — consultar a Ads API na hora (edge meta-ads-insights).';

ALTER TABLE meta_ads_cache ENABLE ROW LEVEL SECURITY;

-- Leitura para usuarios logados (frontend); escrita so via service_role (edge functions)
CREATE POLICY "meta_ads_cache_select_authenticated" ON meta_ads_cache
  FOR SELECT TO authenticated USING (true);
