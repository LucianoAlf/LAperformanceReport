-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.3: Atribuir TODAS as permissões ao perfil Admin
-- =====================================================

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT 
  (SELECT id FROM perfis WHERE nome = 'Admin'),
  p.id
FROM permissoes p
WHERE p.ativo = true
ON CONFLICT DO NOTHING;
