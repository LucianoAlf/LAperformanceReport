-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.6: Permissões do perfil Hunter
-- Foco em captação, leads e vendas
-- =====================================================

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT 
  (SELECT id FROM perfis WHERE nome = 'Hunter'),
  p.id
FROM permissoes p
WHERE p.ativo = true
  AND p.codigo IN (
    -- Dashboard
    'dashboard.ver',
    'metas.ver',
    -- Comercial
    'comercial.ver',
    'comercial.leads.ver',
    'comercial.leads.criar',
    'comercial.leads.editar',
    'comercial.experimentais.ver',
    'comercial.experimentais.criar',
    -- Alunos (limitado)
    'alunos.ver',
    'alunos.criar',
    'alunos.whatsapp'
  )
ON CONFLICT DO NOTHING;
