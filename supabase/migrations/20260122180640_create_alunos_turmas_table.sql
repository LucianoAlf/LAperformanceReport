-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela de relacionamento Alunos x Turmas
CREATE TABLE IF NOT EXISTS alunos_turmas (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  data_entrada DATE DEFAULT CURRENT_DATE,
  data_saida DATE,
  ativo BOOLEAN DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aluno_id, turma_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_alunos_turmas_aluno ON alunos_turmas(aluno_id);
CREATE INDEX IF NOT EXISTS idx_alunos_turmas_turma ON alunos_turmas(turma_id);
CREATE INDEX IF NOT EXISTS idx_alunos_turmas_ativo ON alunos_turmas(ativo);

-- Comentários
COMMENT ON TABLE alunos_turmas IS 'Relacionamento entre alunos e turmas - permite histórico de turmas';
COMMENT ON COLUMN alunos_turmas.data_entrada IS 'Data em que o aluno entrou na turma';
COMMENT ON COLUMN alunos_turmas.data_saida IS 'Data em que o aluno saiu da turma (se aplicável)';
