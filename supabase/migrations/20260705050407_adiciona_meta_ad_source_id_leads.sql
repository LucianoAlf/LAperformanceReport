ALTER TABLE leads ADD COLUMN meta_ad_source_id text;
ALTER TABLE leads ADD COLUMN meta_ctwa_clid text;

COMMENT ON COLUMN leads.meta_ad_source_id IS 'ID do anuncio real na Meta (Graph API), quando o lead veio de clique em anuncio Click-to-WhatsApp (Instagram/Facebook Ads). Populado via leads_atribuicao_pendente + upsert_lead(), ou UPDATE oportunista da edge function registrar-atribuicao-meta-ads.';
COMMENT ON COLUMN leads.meta_ctwa_clid IS 'Click ID do Meta (ctwa_clid), util pra Conversions API no futuro. Mesma origem do meta_ad_source_id.';
