-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar curso_id em evasoes_v2
ALTER TABLE evasoes_v2 
ADD COLUMN IF NOT EXISTS curso_id INTEGER REFERENCES cursos(id);

-- Comentário no campo
COMMENT ON COLUMN evasoes_v2.curso_id IS 'Curso que o aluno fazia quando evadiu';
