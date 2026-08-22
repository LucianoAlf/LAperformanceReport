-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================
-- Migração: Desabilitar RLS temporariamente para teste
-- Data: 2026-01-29
-- =============================================

-- Desabilitar RLS nas tabelas de notificação
ALTER TABLE notificacao_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE notificacao_destinatarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE notificacao_log DISABLE ROW LEVEL SECURITY;
