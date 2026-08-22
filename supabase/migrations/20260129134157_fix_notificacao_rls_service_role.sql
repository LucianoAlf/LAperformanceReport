-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================
-- Migração: Corrigir RLS para permitir acesso via service_role
-- Data: 2026-01-29
-- Necessário para Edge Function funcionar corretamente
-- =============================================

-- Adicionar políticas para service_role em notificacao_config
CREATE POLICY "Service role pode ler config"
ON notificacao_config FOR SELECT
TO service_role
USING (true);

-- Adicionar políticas para service_role em notificacao_destinatarios
CREATE POLICY "Service role pode ler destinatarios"
ON notificacao_destinatarios FOR SELECT
TO service_role
USING (true);

-- Adicionar políticas para service_role em notificacao_log
CREATE POLICY "Service role pode inserir log"
ON notificacao_log FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role pode ler log"
ON notificacao_log FOR SELECT
TO service_role
USING (true);
