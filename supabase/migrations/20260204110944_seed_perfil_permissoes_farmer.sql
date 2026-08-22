-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.5: Permissões do perfil Farmer
-- Foco em atendimento, retenção e rotinas
-- =====================================================

INSERT INTO perfil_permissoes (perfil_id, permissao_id)
SELECT 
  (SELECT id FROM perfis WHERE nome = 'Farmer'),
  p.id
FROM permissoes p
WHERE p.ativo = true
  AND p.codigo IN (
    -- Dashboard
    'dashboard.ver',
    'metas.ver',
    -- Administrativo
    'administrativo.ver',
    'administrativo.lancamentos',
    'administrativo.fideliza',
    'administrativo.lojinha',
    'administrativo.lojinha.vender',
    'administrativo.painel_farmer',
    'administrativo.rotinas',
    'administrativo.tarefas',
    'administrativo.recados',
    -- Alunos
    'alunos.ver',
    'alunos.editar',
    'alunos.whatsapp',
    'alunos.ficha',
    'alunos.health_score',
    -- Professores
    'professores.ver',
    'professores.carteira',
    -- Renovações/Retenção
    'renovacoes.ver',
    'renovacoes.registrar',
    'evasoes.ver',
    'evasoes.registrar',
    'retencao.plano_acao'
  )
ON CONFLICT DO NOTHING;
