-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.8: Permissões do perfil Visualizador
-- Apenas visualização, sem ações
-- =====================================================

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT 
  (SELECT id FROM perfis WHERE nome = 'Visualizador'),
  p.id
FROM permissoes p
WHERE p.ativo = true
  AND p.codigo IN (
    'dashboard.ver',
    'metas.ver',
    'comercial.ver',
    'comercial.leads.ver',
    'comercial.experimentais.ver',
    'administrativo.ver',
    'alunos.ver',
    'professores.ver',
    'renovacoes.ver',
    'evasoes.ver'
  )
ON CONFLICT DO NOTHING;
