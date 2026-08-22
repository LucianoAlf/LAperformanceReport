-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.7: Permissões do perfil Professor
-- Foco em alunos e carteira
-- =====================================================

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT 
  (SELECT id FROM perfis WHERE nome = 'Professor'),
  p.id
FROM permissoes p
WHERE p.ativo = true
  AND p.codigo IN (
    -- Dashboard (limitado)
    'dashboard.ver',
    -- Alunos (apenas ver)
    'alunos.ver',
    'alunos.ficha',
    'alunos.health_score',
    -- Professores
    'professores.ver',
    'professores.carteira'
  )
ON CONFLICT DO NOTHING;
