-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE IF NOT EXISTS professores_experimentais (
  id SERIAL PRIMARY KEY,
  competencia DATE NOT NULL,
  unidade VARCHAR(50) NOT NULL,
  professor VARCHAR(100) NOT NULL,
  quantidade INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competencia, unidade, professor)
);

CREATE INDEX IF NOT EXISTS idx_prof_exp_comp_unid ON professores_experimentais(competencia, unidade);
