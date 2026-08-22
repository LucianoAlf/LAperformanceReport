-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Conceder permissões nas funções
GRANT EXECUTE ON FUNCTION get_programa_fideliza_dados TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION registrar_penalidade_fideliza TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletar_penalidade_fideliza TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION atualizar_config_fideliza TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION salvar_historico_trimestral_fideliza TO authenticated, service_role;

-- Permissões nas tabelas
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_penalidades TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_historico TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_experiencias TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
