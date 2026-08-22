-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar policy de DELETE na tabela evasoes (não existia)
DROP POLICY IF EXISTS evasoes_delete_policy ON evasoes;
CREATE POLICY evasoes_delete_policy ON evasoes
  FOR DELETE
  USING (
    is_admin() OR 
    ((unidade)::text IN (SELECT unidades.nome FROM unidades WHERE unidades.id = get_user_unidade_id()))
  );

-- Adicionar policy de DELETE na tabela movimentacoes (não existia)
DROP POLICY IF EXISTS movimentacoes_delete_policy ON movimentacoes;
CREATE POLICY movimentacoes_delete_policy ON movimentacoes
  FOR DELETE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));

-- Adicionar policy de DELETE na tabela relatorios_diarios (não existia)
DROP POLICY IF EXISTS relatorios_diarios_delete_policy ON relatorios_diarios;
CREATE POLICY relatorios_diarios_delete_policy ON relatorios_diarios
  FOR DELETE
  USING (is_admin() OR (unidade_id = get_user_unidade_id()));

-- Adicionar policy de DELETE na tabela templates_cenario (não existia)
DROP POLICY IF EXISTS templates_cenario_delete_policy ON templates_cenario;
CREATE POLICY templates_cenario_delete_policy ON templates_cenario
  FOR DELETE
  USING (true);
