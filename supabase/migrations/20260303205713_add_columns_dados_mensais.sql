-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar colunas que faltam em dados_mensais
ALTER TABLE dados_mensais ADD COLUMN IF NOT EXISTS alunos_ativos INTEGER;
ALTER TABLE dados_mensais ADD COLUMN IF NOT EXISTS matriculas_ativas INTEGER;
ALTER TABLE dados_mensais ADD COLUMN IF NOT EXISTS matriculas_banda INTEGER;
ALTER TABLE dados_mensais ADD COLUMN IF NOT EXISTS matriculas_2_curso INTEGER;
