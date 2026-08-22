-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE TABLE IF NOT EXISTS dados_comerciais (
  id SERIAL PRIMARY KEY,
  competencia DATE NOT NULL,
  unidade VARCHAR(50) NOT NULL,
  total_leads INTEGER DEFAULT 0,
  aulas_experimentais INTEGER DEFAULT 0,
  novas_matriculas_total INTEGER DEFAULT 0,
  novas_matriculas_lamk INTEGER DEFAULT 0,
  novas_matriculas_emla INTEGER DEFAULT 0,
  ticket_medio_parcelas DECIMAL(10,2),
  ticket_medio_passaporte DECIMAL(10,2),
  faturamento_passaporte DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competencia, unidade)
);

CREATE INDEX IF NOT EXISTS idx_dados_comerciais_comp_unid ON dados_comerciais(competencia, unidade);
