-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Políticas para MOVIMENTACOES
DROP POLICY IF EXISTS "movimentacoes_select_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_select_policy" ON movimentacoes
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "movimentacoes_insert_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_insert_policy" ON movimentacoes
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "movimentacoes_update_policy" ON movimentacoes;
CREATE POLICY "movimentacoes_update_policy" ON movimentacoes
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());

-- Políticas para RENOVACOES
DROP POLICY IF EXISTS "renovacoes_select_policy" ON renovacoes;
CREATE POLICY "renovacoes_select_policy" ON renovacoes
  FOR SELECT USING (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "renovacoes_insert_policy" ON renovacoes;
CREATE POLICY "renovacoes_insert_policy" ON renovacoes
  FOR INSERT WITH CHECK (is_admin() OR unidade_id = get_user_unidade_id());

DROP POLICY IF EXISTS "renovacoes_update_policy" ON renovacoes;
CREATE POLICY "renovacoes_update_policy" ON renovacoes
  FOR UPDATE USING (is_admin() OR unidade_id = get_user_unidade_id());
