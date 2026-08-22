-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.3: MIGRAR DADOS PARA NOVA TABELA METAS
-- Consolidar metas_legado + metas_comerciais
-- ============================================

-- 1. Migrar dados de metas_legado (6 registros) como metas ANUAIS
INSERT INTO metas (
    unidade_id, 
    ano, 
    tipo_periodo,
    meta_alunos_ativos,
    meta_matriculas,
    meta_evasoes_maximo,
    meta_churn_maximo,
    meta_taxa_renovacao,
    meta_ticket_medio,
    meta_ltv_meses,
    meta_inadimplencia_maxima,
    meta_faturamento_parcelas,
    created_at
)
SELECT 
    unidade_id,
    ano,
    'anual',
    meta_alunos,
    meta_matriculas_mes * 12, -- Converter mensal para anual
    meta_evasoes_max,
    meta_churn,
    meta_renovacao,
    meta_ticket,
    meta_permanencia,
    meta_inadimplencia,
    meta_faturamento,
    created_at
FROM metas_legado;

-- 2. Atualizar com dados de metas_comerciais (leads, experimentais, taxa conversão)
-- Campo Grande
UPDATE metas m
SET 
    meta_leads = mc.meta_leads,
    meta_experimentais = mc.meta_experimentais,
    meta_taxa_conversao_lead = mc.meta_taxa_conversao
FROM metas_comerciais mc
WHERE mc.unidade = 'Campo Grande' 
  AND m.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND m.ano = mc.ano;

-- Recreio
UPDATE metas m
SET 
    meta_leads = mc.meta_leads,
    meta_experimentais = mc.meta_experimentais,
    meta_taxa_conversao_lead = mc.meta_taxa_conversao
FROM metas_comerciais mc
WHERE mc.unidade = 'Recreio' 
  AND m.unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d'
  AND m.ano = mc.ano;

-- Barra
UPDATE metas m
SET 
    meta_leads = mc.meta_leads,
    meta_experimentais = mc.meta_experimentais,
    meta_taxa_conversao_lead = mc.meta_taxa_conversao
FROM metas_comerciais mc
WHERE mc.unidade = 'Barra' 
  AND m.unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e'
  AND m.ano = mc.ano;

-- 3. Criar registro consolidado da rede (unidade_id = NULL) para 2026
INSERT INTO metas (
    unidade_id,
    ano,
    tipo_periodo,
    meta_leads,
    meta_experimentais,
    meta_matriculas,
    meta_alunos_ativos,
    meta_evasoes_maximo,
    meta_churn_maximo,
    meta_taxa_renovacao,
    meta_ticket_medio,
    meta_ltv_meses,
    meta_inadimplencia_maxima
)
SELECT 
    NULL,
    2026,
    'anual',
    SUM(meta_leads),
    SUM(meta_experimentais),
    SUM(meta_matriculas),
    SUM(meta_alunos_ativos),
    SUM(meta_evasoes_maximo),
    ROUND(AVG(meta_churn_maximo), 2),
    ROUND(AVG(meta_taxa_renovacao), 2),
    ROUND(AVG(meta_ticket_medio), 2),
    ROUND(AVG(meta_ltv_meses), 1),
    ROUND(AVG(meta_inadimplencia_maxima), 2)
FROM metas
WHERE ano = 2026 AND unidade_id IS NOT NULL;
