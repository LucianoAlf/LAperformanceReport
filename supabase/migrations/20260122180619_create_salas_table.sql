-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabela de Salas (cada unidade tem suas salas com capacidades diferentes)
CREATE TABLE IF NOT EXISTS salas (
  id SERIAL PRIMARY KEY,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  nome VARCHAR(100) NOT NULL,
  codigo VARCHAR(20),
  capacidade_maxima INTEGER NOT NULL DEFAULT 4,
  cursos_permitidos TEXT[], -- Array de cursos que podem usar esta sala
  descricao TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unidade_id, nome)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_salas_unidade ON salas(unidade_id);
CREATE INDEX IF NOT EXISTS idx_salas_ativo ON salas(ativo);

-- Comentários
COMMENT ON TABLE salas IS 'Salas de aula de cada unidade com capacidade máxima';
COMMENT ON COLUMN salas.capacidade_maxima IS 'Número máximo de alunos por turma nesta sala';
COMMENT ON COLUMN salas.cursos_permitidos IS 'Lista de cursos que podem usar esta sala (ex: Guitarra, Violão)';
