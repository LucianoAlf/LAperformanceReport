-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Políticas para EVASOES (usa nome da unidade, não UUID)
DROP POLICY IF EXISTS "evasoes_select_policy" ON evasoes;
CREATE POLICY "evasoes_select_policy" ON evasoes
  FOR SELECT USING (
    is_admin() OR 
    unidade IN (SELECT nome FROM unidades WHERE id = get_user_unidade_id())
  );

DROP POLICY IF EXISTS "evasoes_insert_policy" ON evasoes;
CREATE POLICY "evasoes_insert_policy" ON evasoes
  FOR INSERT WITH CHECK (
    is_admin() OR 
    unidade IN (SELECT nome FROM unidades WHERE id = get_user_unidade_id())
  );

DROP POLICY IF EXISTS "evasoes_update_policy" ON evasoes;
CREATE POLICY "evasoes_update_policy" ON evasoes
  FOR UPDATE USING (
    is_admin() OR 
    unidade IN (SELECT nome FROM unidades WHERE id = get_user_unidade_id())
  );

-- Políticas para RELATORIOS_DIARIOS
DROP POLICY IF EXISTS "relatorios_diarios_select_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_select_policy" ON relatorios_diarios
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "relatorios_diarios_insert_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_insert_policy" ON relatorios_diarios
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "relatorios_diarios_update_policy" ON relatorios_diarios;
CREATE POLICY "relatorios_diarios_update_policy" ON relatorios_diarios
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());
