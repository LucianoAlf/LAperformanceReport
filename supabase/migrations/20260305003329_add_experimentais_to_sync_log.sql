-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE emusys_sync_log
  ADD COLUMN experimentais_count INTEGER DEFAULT 0,
  ADD COLUMN nomes_experimentais JSONB DEFAULT '[]'::jsonb;
