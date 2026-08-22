-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar tipo de saída TRANSFERENCIA
INSERT INTO tipos_saida (codigo, nome, descricao) 
VALUES ('TRANSFERENCIA', 'Transferência', 'Aluno mudou de unidade')
ON CONFLICT (codigo) DO NOTHING;
