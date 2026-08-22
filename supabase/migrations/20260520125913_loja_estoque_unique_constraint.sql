-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- UNIQUE constraint para upsert de estoque
-- COALESCE(variacao_id, 0) porque variacao_id pode ser NULL
CREATE UNIQUE INDEX IF NOT EXISTS loja_estoque_produto_unidade_variacao_uq
ON loja_estoque (produto_id, unidade_id, COALESCE(variacao_id, 0));
