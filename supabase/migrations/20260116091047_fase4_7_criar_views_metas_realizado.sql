-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.7: VIEWS DE METAS VS REALIZADO
-- ============================================

-- VIEW 1: Acompanhamento de metas mensais
CREATE OR REPLACE VIEW vw_metas_vs_realizado AS
WITH realizado AS (
    SELECT 
        unidade_id,
        EXTRACT(YEAR FROM data_referencia)::INTEGER AS ano,
        EXTRACT(MONTH FROM data_referencia)::INTEGER AS mes,
        MAX(matriculas_acumulado_mes) AS matriculas_realizadas,
        MAX(renovacoes_acumulado_mes) AS renovacoes_realizadas,
        MAX(evasoes_acumulado_mes) AS evasoes_realizadas,
        MAX(leads_acumulado_mes) AS leads_realizados,
        MAX(faturamento_realizado_mes) AS faturamento_realizado,
        MAX(total_alunos_ativos) AS alunos_ativos,
        MAX(total_alunos_pagantes) AS alunos_pagantes,
        MAX(ticket_medio_atual) AS ticket_medio,
        MAX(churn_rate_mes) AS churn_rate,
        MAX(taxa_renovacao_mes) AS taxa_renovacao
    FROM relatorios_diarios
    GROUP BY unidade_id, ano, mes
)
SELECT 
    u.nome AS unidade,
    m.ano,
    m.mes,
    TO_CHAR(MAKE_DATE(m.ano, m.mes, 1), 'YYYY-MM') AS ano_mes,
    
    -- Matrículas
    m.meta_matriculas,
    r.matriculas_realizadas,
    ROUND(100.0 * r.matriculas_realizadas / NULLIF(m.meta_matriculas, 0), 1) AS pct_matriculas,
    
    -- Renovações
    m.meta_renovacoes,
    r.renovacoes_realizadas,
    ROUND(100.0 * r.renovacoes_realizadas / NULLIF(m.meta_renovacoes, 0), 1) AS pct_renovacoes,
    
    -- Churn
    m.meta_churn_maximo,
    r.churn_rate AS churn_realizado,
    CASE WHEN r.churn_rate <= m.meta_churn_maximo THEN 'OK' ELSE 'ALERTA' END AS status_churn,
    
    -- Faturamento
    m.meta_faturamento_parcelas,
    r.faturamento_realizado,
    ROUND(100.0 * r.faturamento_realizado / NULLIF(m.meta_faturamento_parcelas, 0), 1) AS pct_faturamento,
    
    -- Alunos
    m.meta_alunos_ativos,
    r.alunos_ativos,
    ROUND(100.0 * r.alunos_ativos / NULLIF(m.meta_alunos_ativos, 0), 1) AS pct_alunos

FROM metas m
JOIN unidades u ON m.unidade_id = u.id
LEFT JOIN realizado r ON m.unidade_id = r.unidade_id 
    AND m.ano = r.ano 
    AND m.mes = r.mes
WHERE m.tipo_periodo = 'mensal'
ORDER BY m.ano DESC, m.mes DESC, u.nome;

-- VIEW 2: Projeção de atingimento de meta
CREATE OR REPLACE VIEW vw_projecao_metas AS
WITH dados_mes AS (
    SELECT 
        unidade_id,
        EXTRACT(YEAR FROM data_referencia)::INTEGER AS ano,
        EXTRACT(MONTH FROM data_referencia)::INTEGER AS mes,
        MAX(data_referencia) AS ultima_data,
        EXTRACT(DAY FROM MAX(data_referencia))::INTEGER AS dias_passados,
        EXTRACT(DAY FROM (DATE_TRUNC('month', MAX(data_referencia)) + INTERVAL '1 month - 1 day'))::INTEGER AS dias_no_mes,
        MAX(matriculas_acumulado_mes) AS matriculas_ate_agora,
        MAX(evasoes_acumulado_mes) AS evasoes_ate_agora,
        MAX(faturamento_realizado_mes) AS faturamento_ate_agora
    FROM relatorios_diarios
    GROUP BY unidade_id, ano, mes
)
SELECT 
    u.nome AS unidade,
    d.ano,
    d.mes,
    d.dias_passados,
    d.dias_no_mes,
    
    -- Projeção de matrículas
    m.meta_matriculas,
    d.matriculas_ate_agora,
    ROUND(d.matriculas_ate_agora::NUMERIC / NULLIF(d.dias_passados, 0) * d.dias_no_mes) AS matriculas_projetadas,
    CASE 
        WHEN d.dias_passados = 0 THEN '⚪ Sem dados'
        WHEN ROUND(d.matriculas_ate_agora::NUMERIC / d.dias_passados * d.dias_no_mes) >= m.meta_matriculas 
        THEN '🟢 No caminho'
        WHEN ROUND(d.matriculas_ate_agora::NUMERIC / d.dias_passados * d.dias_no_mes) >= m.meta_matriculas * 0.8 
        THEN '🟡 Atenção'
        ELSE '🔴 Crítico'
    END AS status_matriculas,
    
    -- Projeção de faturamento
    m.meta_faturamento_parcelas,
    d.faturamento_ate_agora,
    ROUND(d.faturamento_ate_agora / NULLIF(d.dias_passados, 0) * d.dias_no_mes, 2) AS faturamento_projetado,
    CASE 
        WHEN d.dias_passados = 0 THEN '⚪ Sem dados'
        WHEN ROUND(d.faturamento_ate_agora / d.dias_passados * d.dias_no_mes, 2) >= m.meta_faturamento_parcelas 
        THEN '🟢 No caminho'
        WHEN ROUND(d.faturamento_ate_agora / d.dias_passados * d.dias_no_mes, 2) >= m.meta_faturamento_parcelas * 0.8 
        THEN '🟡 Atenção'
        ELSE '🔴 Crítico'
    END AS status_faturamento

FROM dados_mes d
JOIN unidades u ON d.unidade_id = u.id
JOIN metas m ON d.unidade_id = m.unidade_id 
    AND d.ano = m.ano 
    AND d.mes = m.mes
WHERE m.tipo_periodo = 'mensal'
ORDER BY d.ano DESC, d.mes DESC, u.nome;
