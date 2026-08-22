-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campos de NPS e média de turma em professores
ALTER TABLE professores 
ADD COLUMN IF NOT EXISTS nps_medio DECIMAL(3,1),
ADD COLUMN IF NOT EXISTS media_alunos_turma DECIMAL(4,1);

-- Comentários nos campos
COMMENT ON COLUMN professores.nps_medio IS 'NPS médio do professor baseado em pesquisas';
COMMENT ON COLUMN professores.media_alunos_turma IS 'Média de alunos por turma do professor';
