-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar colunas de passaporte em dados_mensais
ALTER TABLE dados_mensais 
ADD COLUMN IF NOT EXISTS ticket_medio_passaporte NUMERIC,
ADD COLUMN IF NOT EXISTS faturamento_passaporte NUMERIC;
