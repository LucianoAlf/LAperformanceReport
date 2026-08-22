-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE IF NOT EXISTS metas_comerciais (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  unidade VARCHAR(50) NOT NULL,
  meta_leads INTEGER,
  meta_experimentais INTEGER,
  meta_matriculas INTEGER,
  meta_taxa_conversao DECIMAL(5,2),
  meta_ticket_medio DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ano, unidade)
);

CREATE INDEX IF NOT EXISTS idx_metas_comerciais_ano ON metas_comerciais(ano);
