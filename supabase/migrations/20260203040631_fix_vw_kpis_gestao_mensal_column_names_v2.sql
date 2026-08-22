-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Recriar a view com os nomes de colunas corretos
DROP VIEW IF EXISTS vw_kpis_gestao_mensal;

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH leads_mes AS (
    SELECT 
        unidade_id,
        EXTRACT(year FROM data)::integer AS ano,
        EXTRACT(month FROM data)::integer AS mes,
        SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END) AS total_leads,
        SUM(CASE WHEN tipo = 'experimental_agendada' THEN quantidade ELSE 0 END) AS experimentais_agendadas,
        SUM(CASE WHEN tipo = 'experimental_realizada' THEN quantidade ELSE 0 END) AS experimentais_realizadas,
        SUM(CASE WHEN tipo = 'experimental_faltou' THEN quantidade ELSE 0 END) AS faltaram,
        SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END) AS novas_matriculas,
        SUM(CASE WHEN arquivado = true THEN quantidade ELSE 0 END) AS leads_arquivados
    FROM leads_diarios
    GROUP BY unidade_id, EXTRACT(year FROM data), EXTRACT(month FROM data)
),
alunos_mes AS (
    SELECT 
        a.unidade_id,
        EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
        EXTRACT(month FROM CURRENT_DATE)::integer AS mes,
        COUNT(*) AS total_alunos,
        COUNT(*) FILTER (WHERE tm.conta_como_pagante = true) AS alunos_pagantes,
        COUNT(*) FILTER (WHERE tm.codigo = 'BOLSISTA_INT') AS bolsistas_integrais,
        COUNT(*) FILTER (WHERE tm.codigo = 'BOLSISTA_PARC') AS bolsistas_parciais,
        COUNT(*) FILTER (WHERE tm.codigo = 'BANDA') AS total_banda,
        COUNT(*) FILTER (WHERE a.is_segundo_curso = true) AS segundo_curso,
        AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
        SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr,
        AVG(a.tempo_permanencia_meses) AS tempo_permanencia_medio
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.status = 'ativo'
    GROUP BY a.unidade_id
),
evasoes_mes AS (
    SELECT 
        u.id AS unidade_id,
        EXTRACT(year FROM e.competencia)::integer AS ano,
        EXTRACT(month FROM e.competencia)::integer AS mes,
        COUNT(*) AS total_evasoes
    FROM evasoes e
    JOIN unidades u ON u.nome = e.unidade
    GROUP BY u.id, EXTRACT(year FROM e.competencia), EXTRACT(month FROM e.competencia)
),
renovacoes_mes AS (
    SELECT 
        unidade_id,
        EXTRACT(year FROM data_renovacao)::integer AS ano,
        EXTRACT(month FROM data_renovacao)::integer AS mes,
        COUNT(*) FILTER (WHERE status = 'renovado') AS renovacoes,
        COUNT(*) AS total_contratos,
        AVG(percentual_reajuste) FILTER (WHERE status = 'renovado') AS reajuste_medio
    FROM renovacoes
    GROUP BY unidade_id, EXTRACT(year FROM data_renovacao), EXTRACT(month FROM data_renovacao)
),
dados_anterior AS (
    SELECT unidade_id, ano, mes, alunos_pagantes
    FROM dados_mensais
)
SELECT 
    u.id AS unidade_id,
    u.nome AS unidade_nome,
    COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
    COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,
    -- Nomes corrigidos para compatibilidade com o frontend
    COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
    COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
    COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
    COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,
    COALESCE(am.total_banda, 0)::integer AS total_banda,
    COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,
    COALESCE(am.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
    COALESCE(am.mrr, 0)::numeric(12,2) AS mrr,
    (COALESCE(am.mrr, 0) * 12)::numeric(14,2) AS arr,
    COALESCE(am.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia_medio,
    (COALESCE(am.ticket_medio, 0) * COALESCE(am.tempo_permanencia_medio, 0))::numeric(12,2) AS ltv_medio,
    0::numeric(5,2) AS inadimplencia_pct,
    COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_previsto,
    COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_realizado,
    COALESCE(lm.total_leads, 0)::integer AS total_leads,
    COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
    COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,
    COALESCE(lm.novas_matriculas, 0)::integer AS novas_matriculas,
    COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
    CASE 
        WHEN COALESCE(da.alunos_pagantes, 0) > 0 
        THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / da.alunos_pagantes * 100, 2)
        ELSE 0
    END::numeric(5,2) AS churn_rate,
    COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
    CASE 
        WHEN COALESCE(rm.total_contratos, 0) > 0 
        THEN ROUND(rm.renovacoes::numeric / rm.total_contratos * 100, 2)
        ELSE 0
    END::numeric(5,2) AS taxa_renovacao,
    COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = COALESCE(lm.ano, am.ano) AND em.mes = COALESCE(lm.mes, am.mes)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = COALESCE(lm.ano, am.ano) AND rm.mes = COALESCE(lm.mes, am.mes)
LEFT JOIN dados_anterior da ON da.unidade_id = u.id AND da.ano = COALESCE(lm.ano, am.ano) AND da.mes = (COALESCE(lm.mes, am.mes) - 1)
WHERE u.ativo = true;
