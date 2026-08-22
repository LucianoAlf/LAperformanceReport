-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tarefas do Projeto
CREATE TABLE IF NOT EXISTS projeto_tarefas (
  id SERIAL PRIMARY KEY,
  fase_id INTEGER NOT NULL REFERENCES projeto_fases(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  ordem INTEGER NOT NULL DEFAULT 1,
  data_inicio DATE,
  data_fim_prevista DATE,
  data_fim_real DATE,
  responsavel_tipo VARCHAR(20) CHECK (responsavel_tipo IN ('usuario', 'professor')),
  responsavel_id INTEGER,
  tarefa_pai_id INTEGER REFERENCES projeto_tarefas(id),
  dependencia_id INTEGER REFERENCES projeto_tarefas(id),
  estimativa_horas DECIMAL(5,2),
  horas_gastas DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
