-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Amplia o campo tipo para suportar 'entrada_transferencia' (21 chars)
ALTER TABLE loja_movimentacoes_estoque
  ALTER COLUMN tipo TYPE VARCHAR(30);
