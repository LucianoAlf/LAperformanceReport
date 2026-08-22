-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2. Tabela de Penalidades do Fideliza+
CREATE TABLE IF NOT EXISTS programa_fideliza_penalidades (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  tipo VARCHAR(50) NOT NULL,
  descricao TEXT,
  pontos_descontados INTEGER NOT NULL DEFAULT 3,
  data_ocorrencia DATE NOT NULL DEFAULT CURRENT_DATE,
  registrado_por VARCHAR(100) NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fideliza_penalidades_ano_trim 
ON programa_fideliza_penalidades(ano, trimestre, unidade_id);
