-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela para anotações de alunos
CREATE TABLE IF NOT EXISTS anotacoes_alunos (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  categoria VARCHAR(50) DEFAULT 'geral',
  criado_por VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca por aluno
CREATE INDEX IF NOT EXISTS idx_anotacoes_alunos_aluno_id ON anotacoes_alunos(aluno_id);

-- Comentários
COMMENT ON TABLE anotacoes_alunos IS 'Anotações e observações sobre alunos';
COMMENT ON COLUMN anotacoes_alunos.categoria IS 'Categoria: geral, pedagogico, financeiro, comportamento, elogio, reclamacao';
