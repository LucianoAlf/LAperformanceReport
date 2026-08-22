-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE loja_movimentacoes_estoque
  DROP CONSTRAINT IF EXISTS loja_movimentacoes_estoque_tipo_check;

ALTER TABLE loja_movimentacoes_estoque
  ADD CONSTRAINT loja_movimentacoes_estoque_tipo_check
  CHECK (tipo IN ('entrada','venda','estorno','ajuste','saida_transferencia','entrada_transferencia'));
