-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Políticas para ALUNOS
DROP POLICY IF EXISTS "alunos_select_policy" ON alunos;
CREATE POLICY "alunos_select_policy" ON alunos
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "alunos_insert_policy" ON alunos;
CREATE POLICY "alunos_insert_policy" ON alunos
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "alunos_update_policy" ON alunos;
CREATE POLICY "alunos_update_policy" ON alunos
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "alunos_delete_policy" ON alunos;
CREATE POLICY "alunos_delete_policy" ON alunos
  FOR DELETE USING (is_admin());

-- Políticas para LEADS
DROP POLICY IF EXISTS "leads_select_policy" ON leads;
CREATE POLICY "leads_select_policy" ON leads
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "leads_insert_policy" ON leads;
CREATE POLICY "leads_insert_policy" ON leads
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "leads_update_policy" ON leads;
CREATE POLICY "leads_update_policy" ON leads
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "leads_delete_policy" ON leads;
CREATE POLICY "leads_delete_policy" ON leads
  FOR DELETE USING (is_admin());
