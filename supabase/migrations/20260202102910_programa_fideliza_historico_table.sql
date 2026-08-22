-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 3. Tabela de Histórico Trimestral
CREATE TABLE IF NOT EXISTS programa_fideliza_historico (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  churn_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  inadimplencia_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxa_renovacao DECIMAL(5,2) NOT NULL DEFAULT 0,
  reajuste_medio DECIMAL(5,2) NOT NULL DEFAULT 0,
  vendas_lojinha DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  bateu_churn BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_inadimplencia BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_renovacao BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_reajuste BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_lojinha BOOLEAN NOT NULL DEFAULT FALSE,
  
  pontos_base INTEGER NOT NULL DEFAULT 0,
  pontos_bonus INTEGER NOT NULL DEFAULT 0,
  pontos_penalidades INTEGER NOT NULL DEFAULT 0,
  pontos_total INTEGER NOT NULL DEFAULT 0,
  
  posicao INTEGER,
  experiencia_tipo VARCHAR(20),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ano, trimestre, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_fideliza_historico_ano_trim 
ON programa_fideliza_historico(ano, trimestre);
