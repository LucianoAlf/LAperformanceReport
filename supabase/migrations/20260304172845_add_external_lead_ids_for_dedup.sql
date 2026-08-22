-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- IDs externos para dedup de leads da automacao
ALTER TABLE leads ADD COLUMN emusys_lead_id INTEGER;
ALTER TABLE leads ADD COLUMN nocodb_lead_id INTEGER;

-- Indices unicos parciais para dedup
CREATE UNIQUE INDEX idx_leads_emusys_lead_id
  ON leads (emusys_lead_id) WHERE emusys_lead_id IS NOT NULL;

CREATE UNIQUE INDEX idx_leads_nocodb_lead_id
  ON leads (nocodb_lead_id) WHERE nocodb_lead_id IS NOT NULL;
