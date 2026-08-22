-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE TABLE IF NOT EXISTS professor_360_ocorrencias (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  criterio_id INTEGER NOT NULL REFERENCES professor_360_criterios(id),
  competencia VARCHAR(7) NOT NULL,
  data_ocorrencia DATE NOT NULL,
  descricao TEXT,
  escopo VARCHAR(20) DEFAULT 'unidade',
  registrado_por TEXT,
  notificado BOOLEAN DEFAULT false,
  data_notificacao TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_professor ON professor_360_ocorrencias(professor_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_competencia ON professor_360_ocorrencias(competencia);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_unidade ON professor_360_ocorrencias(unidade_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_criterio ON professor_360_ocorrencias(criterio_id);
