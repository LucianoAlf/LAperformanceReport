-- RPC usada pela edge enriquecer-meta-ads: source_ids de leads sem cache (ou com erro antigo)
CREATE OR REPLACE FUNCTION listar_meta_source_ids_pendentes()
RETURNS TABLE(source_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT l.meta_ad_source_id
  FROM leads l
  LEFT JOIN meta_ads_cache c ON c.source_id = l.meta_ad_source_id
  WHERE l.meta_ad_source_id IS NOT NULL
    AND (c.source_id IS NULL OR (c.erro IS NOT NULL AND c.enriquecido_em < now() - interval '1 day'));
$$;

-- Cron diario 08:10 UTC (05:10 BRT): enriquece anuncios novos capturados no dia anterior
SELECT cron.schedule(
  'enriquecer-meta-ads-diario',
  '10 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/enriquecer-meta-ads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
