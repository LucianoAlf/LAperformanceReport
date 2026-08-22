-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Aumentar limite do campo aluno_novo_retorno para 100 caracteres
ALTER TABLE leads_diarios 
ALTER COLUMN aluno_novo_retorno TYPE VARCHAR(100);
