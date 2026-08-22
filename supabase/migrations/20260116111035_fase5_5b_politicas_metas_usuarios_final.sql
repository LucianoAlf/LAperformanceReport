-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Políticas para METAS (apenas admin pode criar/editar)
DROP POLICY IF EXISTS "metas_select_policy" ON metas;
CREATE POLICY "metas_select_policy" ON metas
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "metas_insert_policy" ON metas;
CREATE POLICY "metas_insert_policy" ON metas
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "metas_update_policy" ON metas;
CREATE POLICY "metas_update_policy" ON metas
  FOR UPDATE USING (is_admin());

-- Políticas para USUARIOS (apenas admin gerencia)
DROP POLICY IF EXISTS "usuarios_select_policy" ON usuarios;
CREATE POLICY "usuarios_select_policy" ON usuarios
  FOR SELECT USING (is_admin() OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS "usuarios_insert_policy" ON usuarios;
CREATE POLICY "usuarios_insert_policy" ON usuarios
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "usuarios_update_policy" ON usuarios;
CREATE POLICY "usuarios_update_policy" ON usuarios
  FOR UPDATE USING (is_admin() OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS "usuarios_delete_policy" ON usuarios;
CREATE POLICY "usuarios_delete_policy" ON usuarios
  FOR DELETE USING (is_admin());
