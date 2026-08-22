-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar tabela de relacionamento entre unidades e cursos
CREATE TABLE IF NOT EXISTS unidades_cursos (
  id SERIAL PRIMARY KEY,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unidade_id, curso_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_unidades_cursos_unidade ON unidades_cursos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_unidades_cursos_curso ON unidades_cursos(curso_id);

-- Comentários
COMMENT ON TABLE unidades_cursos IS 'Relacionamento entre unidades e cursos - define quais cursos cada unidade oferece';
COMMENT ON COLUMN unidades_cursos.ativo IS 'Se o curso está ativo nesta unidade específica';
