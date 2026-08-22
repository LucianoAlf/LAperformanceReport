-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Trocar partial index por constraint real (Supabase JS client não suporta partial indexes no upsert)
DROP INDEX IF EXISTS idx_presenca_aluno_aula;

-- Constraint real: NULLs são distintos em PostgreSQL, então registros legados (aula_emusys_id=NULL) não conflitam
ALTER TABLE aluno_presenca ADD CONSTRAINT uq_presenca_aluno_aula UNIQUE (aluno_id, aula_emusys_id);
