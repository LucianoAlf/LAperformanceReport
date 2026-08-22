-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- MIGRAÇÃO: Desabilitar triggers de sincronização de leads
-- Estes triggers causam redundância entre leads e leads_diarios
-- =====================================================

-- 1. Desabilitar trigger que sincroniza leads -> leads_diarios
DROP TRIGGER IF EXISTS trigger_sync_lead_to_leads_diarios ON leads;

-- 2. Manter a função por enquanto (pode ser útil para rollback)
-- DROP FUNCTION IF EXISTS sync_lead_to_leads_diarios();

-- Comentário de auditoria
COMMENT ON FUNCTION sync_lead_to_leads_diarios() IS 'DEPRECATED: Função desabilitada em 2026-02-05. Trigger removido para eliminar redundância entre leads e leads_diarios.';
