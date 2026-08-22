-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campo sabia_preco para medir conversão de leads que sabiam o preço antes da experimental
ALTER TABLE leads_diarios ADD COLUMN IF NOT EXISTS sabia_preco BOOLEAN DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN leads_diarios.sabia_preco IS 'Indica se o lead sabia o preço antes de fazer a aula experimental. Usado para medir taxa de conversão.';
