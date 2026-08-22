-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar tabela de turmas explícitas (turmas regulares e bandas)
CREATE TABLE IF NOT EXISTS turmas_explicitas (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('turma', 'banda')),
  nome VARCHAR(255),
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  curso_id INTEGER REFERENCES cursos(id) ON DELETE SET NULL,
  dia_semana VARCHAR(20) NOT NULL,
  horario_inicio TIME NOT NULL,
  sala_id INTEGER REFERENCES salas(id) ON DELETE SET NULL,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  capacidade_maxima INTEGER,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de relacionamento entre turmas e alunos
CREATE TABLE IF NOT EXISTS turmas_alunos (
  id SERIAL PRIMARY KEY,
  turma_id INTEGER NOT NULL REFERENCES turmas_explicitas(id) ON DELETE CASCADE,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(turma_id, aluno_id)
);

-- Criar índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_turmas_explicitas_professor ON turmas_explicitas(professor_id);
CREATE INDEX IF NOT EXISTS idx_turmas_explicitas_unidade ON turmas_explicitas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_turmas_explicitas_dia_horario ON turmas_explicitas(dia_semana, horario_inicio);
CREATE INDEX IF NOT EXISTS idx_turmas_alunos_turma ON turmas_alunos(turma_id);
CREATE INDEX IF NOT EXISTS idx_turmas_alunos_aluno ON turmas_alunos(aluno_id);

-- Comentários nas tabelas
COMMENT ON TABLE turmas_explicitas IS 'Turmas explícitas criadas manualmente (turmas regulares e bandas)';
COMMENT ON TABLE turmas_alunos IS 'Relacionamento entre turmas explícitas e alunos';
COMMENT ON COLUMN turmas_explicitas.tipo IS 'Tipo da turma: turma (regular) ou banda';
COMMENT ON COLUMN turmas_explicitas.nome IS 'Nome da turma/banda (obrigatório apenas para bandas)';
COMMENT ON COLUMN turmas_explicitas.capacidade_maxima IS 'Capacidade máxima (apenas para turmas regulares)';
