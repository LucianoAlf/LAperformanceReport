-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.4: Permissões do perfil Gerente
-- Quase tudo, exceto gerenciar permissões e configurações
-- =====================================================

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT 
  (SELECT id FROM perfis WHERE nome = 'Gerente'),
  p.id
FROM permissoes p
WHERE p.ativo = true
  AND p.codigo NOT IN (
    'permissoes.gerenciar',
    'perfis.gerenciar',
    'configuracoes.gerenciar'
  )
ON CONFLICT DO NOTHING;
