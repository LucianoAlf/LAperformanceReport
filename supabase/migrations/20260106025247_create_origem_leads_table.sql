-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE IF NOT EXISTS origem_leads (
  id SERIAL PRIMARY KEY,
  competencia DATE NOT NULL,
  unidade VARCHAR(50) NOT NULL,
  canal VARCHAR(50) NOT NULL,
  tipo VARCHAR(20) NOT NULL,
  quantidade INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competencia, unidade, canal, tipo)
);

CREATE INDEX IF NOT EXISTS idx_origem_comp_unid ON origem_leads(competencia, unidade);
