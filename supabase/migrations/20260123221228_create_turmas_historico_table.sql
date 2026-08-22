-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela para histórico de mudanças em turmas (audit log)
CREATE TABLE IF NOT EXISTS turmas_historico (
  id SERIAL PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas_explicitas(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  acao VARCHAR(50) NOT NULL CHECK (acao IN ('adicionar', 'remover', 'mover')),
  turma_origem_id INTEGER REFERENCES turmas_explicitas(id) ON DELETE SET NULL,
  turma_destino_id INTEGER REFERENCES turmas_explicitas(id) ON DELETE SET NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_turmas_historico_turma_id ON turmas_historico(turma_id);
CREATE INDEX IF NOT EXISTS idx_turmas_historico_aluno_id ON turmas_historico(aluno_id);
CREATE INDEX IF NOT EXISTS idx_turmas_historico_created_at ON turmas_historico(created_at DESC);

-- Comentário na tabela
COMMENT ON TABLE turmas_historico IS 'Histórico de mudanças em turmas: adições, remoções e movimentações de alunos';
COMMENT ON COLUMN turmas_historico.acao IS 'Tipo de ação: adicionar, remover ou mover';
COMMENT ON COLUMN turmas_historico.turma_origem_id IS 'Turma de origem (usado apenas em ação mover)';
COMMENT ON COLUMN turmas_historico.turma_destino_id IS 'Turma de destino (usado apenas em ação mover)';
COMMENT ON COLUMN turmas_historico.metadata IS 'Dados adicionais como conflitos detectados, horários, etc.';
