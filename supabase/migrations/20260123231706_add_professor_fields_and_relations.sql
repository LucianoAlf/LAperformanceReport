-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar colunas faltantes na tabela professores (sem email/telefone)
ALTER TABLE professores ADD COLUMN IF NOT EXISTS data_admissao DATE;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2) DEFAULT 0;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE professores ADD COLUMN IF NOT EXISTS foto_url VARCHAR(500);

-- Tabela de relacionamento professor-unidade (muitos para muitos)
CREATE TABLE IF NOT EXISTS professores_unidades (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(professor_id, unidade_id)
);

-- Tabela de relacionamento professor-curso (especialidades)
CREATE TABLE IF NOT EXISTS professores_cursos (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  curso_id INTEGER NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(professor_id, curso_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_professores_unidades_professor ON professores_unidades(professor_id);
CREATE INDEX IF NOT EXISTS idx_professores_unidades_unidade ON professores_unidades(unidade_id);
CREATE INDEX IF NOT EXISTS idx_professores_cursos_professor ON professores_cursos(professor_id);
CREATE INDEX IF NOT EXISTS idx_professores_cursos_curso ON professores_cursos(curso_id);
CREATE INDEX IF NOT EXISTS idx_professores_ativo ON professores(ativo);
CREATE INDEX IF NOT EXISTS idx_professores_data_admissao ON professores(data_admissao);

-- Comentários para documentação
COMMENT ON TABLE professores_unidades IS 'Relacionamento N:N entre professores e unidades onde atuam';
COMMENT ON TABLE professores_cursos IS 'Relacionamento N:N entre professores e cursos que lecionam (especialidades)';
COMMENT ON COLUMN professores.data_admissao IS 'Data de admissão do professor na escola';
COMMENT ON COLUMN professores.comissao_percentual IS 'Percentual de comissão do professor';
COMMENT ON COLUMN professores.foto_url IS 'URL da foto do professor no storage';
