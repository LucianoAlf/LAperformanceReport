-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir policy de DELETE na tabela leads
-- Permitir que usuários de unidade deletem leads da sua própria unidade
DROP POLICY IF EXISTS leads_delete_policy ON leads;
CREATE POLICY leads_delete_policy ON leads
  FOR DELETE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));
