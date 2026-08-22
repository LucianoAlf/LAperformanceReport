-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir policy de DELETE na tabela alunos
-- Permitir que usuários de unidade deletem alunos da sua própria unidade
DROP POLICY IF EXISTS alunos_delete_policy ON alunos;
CREATE POLICY alunos_delete_policy ON alunos
  FOR DELETE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));

-- Corrigir policy de DELETE na tabela leads_diarios
-- Permitir que usuários de unidade deletem leads da sua própria unidade
DROP POLICY IF EXISTS leads_diarios_delete ON leads_diarios;
CREATE POLICY leads_diarios_delete ON leads_diarios
  FOR DELETE
  USING (
    (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.auth_user_id = auth.uid() AND usuarios.perfil = 'admin'))
    OR 
    (unidade_id IN (SELECT usuarios.unidade_id FROM usuarios WHERE usuarios.auth_user_id = auth.uid()))
  );

-- Corrigir policy de DELETE na tabela evasoes_v2
-- Permitir que usuários de unidade deletem evasões da sua própria unidade
DROP POLICY IF EXISTS evasoes_v2_delete ON evasoes_v2;
CREATE POLICY evasoes_v2_delete ON evasoes_v2
  FOR DELETE
  USING (
    (EXISTS (SELECT 1 FROM usuarios WHERE usuarios.auth_user_id = auth.uid() AND usuarios.perfil = 'admin'))
    OR 
    (unidade_id IN (SELECT usuarios.unidade_id FROM usuarios WHERE usuarios.auth_user_id = auth.uid()))
  );

-- Adicionar policy de DELETE na tabela renovacoes (não existia)
DROP POLICY IF EXISTS renovacoes_delete_policy ON renovacoes;
CREATE POLICY renovacoes_delete_policy ON renovacoes
  FOR DELETE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));
