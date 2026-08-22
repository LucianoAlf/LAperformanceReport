-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Fix: UNIQUE constraint precisa de NULLS NOT DISTINCT para upsert com unidade_id = NULL
ALTER TABLE config_health_score_professor 
  DROP CONSTRAINT config_health_prof_unidade_unique;

ALTER TABLE config_health_score_professor 
  ADD CONSTRAINT config_health_prof_unidade_unique 
  UNIQUE NULLS NOT DISTINCT (unidade_id);
