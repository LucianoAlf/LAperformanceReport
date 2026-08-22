-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela de Turmas (combinação de professor + dia + horário + sala)
CREATE TABLE IF NOT EXISTS turmas (
  id SERIAL PRIMARY KEY,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  professor_id INTEGER NOT NULL REFERENCES professores(id),
  sala_id INTEGER REFERENCES salas(id),
  curso_id INTEGER REFERENCES cursos(id),
  dia_semana VARCHAR(20) NOT NULL, -- Segunda, Terça, etc
  horario_inicio TIME NOT NULL,
  horario_fim TIME,
  capacidade_maxima INTEGER DEFAULT 4,
  nome VARCHAR(100), -- Nome opcional da turma
  observacoes TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unidade_id, professor_id, dia_semana, horario_inicio)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_turmas_unidade ON turmas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_turmas_professor ON turmas(professor_id);
CREATE INDEX IF NOT EXISTS idx_turmas_sala ON turmas(sala_id);
CREATE INDEX IF NOT EXISTS idx_turmas_dia ON turmas(dia_semana);
CREATE INDEX IF NOT EXISTS idx_turmas_ativo ON turmas(ativo);

-- Comentários
COMMENT ON TABLE turmas IS 'Turmas de aula - combinação de professor, dia, horário e sala';
COMMENT ON COLUMN turmas.capacidade_maxima IS 'Capacidade máxima de alunos nesta turma (herda da sala se não definido)';
