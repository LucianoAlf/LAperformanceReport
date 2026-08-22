-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir contagem de banda na view vw_kpis_gestao_mensal
-- A view atual só conta pelo tipo_matricula_id = 'BANDA'
-- Precisa contar também pelos cursos "Minha Banda Para Sempre" e "Power Kids"

DROP VIEW IF EXISTS vw_kpis_gestao_mensal;

CREATE VIEW vw_kpis_gestao_mensal AS
WITH matriculas_mes AS (
    SELECT 
        l.unidade_id,
        EXTRACT(year FROM l.data_contato)::integer AS ano,
        EXTRACT(month FROM l.data_contato)::integer AS mes,
        SUM(COALESCE(l.quantidade, 1)) AS novas_matriculas
    FROM leads l
    WHERE l.status IN ('matriculado', 'convertido')
      AND (l.tipo_aluno IS NULL OR l.tipo_aluno NOT IN ('bolsista_integral', 'nao_pagante'))
    GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
alunos_ticket AS (
    SELECT 
        a.unidade_id,
        (lower(trim(BOTH FROM a.nome)) || '-' || COALESCE(a.data_nascimento::text, '')) || '-' || a.unidade_id AS chave_aluno,
        SUM(a.valor_parcela) AS valor_total
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.status IN ('ativo', 'trancado')
      AND tm.entra_ticket_medio = true
      AND a.valor_parcela > 0
    GROUP BY a.unidade_id, (lower(trim(BOTH FROM a.nome)) || '-' || COALESCE(a.data_nascimento::text, '')) || '-' || a.unidade_id
),
ticket_por_unidade AS (
    SELECT 
        unidade_id,
        COUNT(*) AS total_alunos_ticket,
        SUM(valor_total) AS soma_parcelas,
        AVG(valor_total) AS ticket_medio_calculado
    FROM alunos_ticket
    GROUP BY unidade_id
),
alunos_mes AS (
    SELECT 
        a.unidade_id,
        EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
        EXTRACT(month FROM CURRENT_DATE)::integer AS mes,
        COUNT(*) FILTER (WHERE a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AS total_alunos,
        COUNT(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS alunos_pagantes,
        COUNT(*) FILTER (WHERE tm.codigo = 'BOLSISTA_INT' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_integrais,
        COUNT(*) FILTER (WHERE tm.codigo = 'BOLSISTA_PARC' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_parciais,
        -- CORREÇÃO: Contar banda por tipo_matricula OU pelo nome do curso
        COUNT(*) FILTER (WHERE (
            tm.codigo = 'BANDA' 
            OR c.nome ILIKE '%banda%' 
            OR c.nome ILIKE '%power kids%'
            OR c.nome ILIKE '%minha banda%'
        ) AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_banda,
        COUNT(*) FILTER (WHERE a.is_segundo_curso = true) AS segundo_curso,
        SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS mrr,
        COUNT(*) FILTER (WHERE a.status_pagamento = 'inadimplente' AND tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS qtd_inadimplentes,
        COALESCE(SUM(a.valor_parcela) FILTER (WHERE a.status_pagamento = 'inadimplente' AND tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela'), 0) AS mrr_inadimplente
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    LEFT JOIN cursos c ON c.id = a.curso_id
    WHERE a.status IN ('ativo', 'trancado')
    GROUP BY a.unidade_id
),
-- ... resto da view permanece igual
permanencia_combinada AS (
    SELECT unidade_id, tempo_permanencia_meses AS meses
    FROM alunos_historico
    WHERE tempo_permanencia_meses >= 4
    UNION ALL
    SELECT a.unidade_id, a.tempo_permanencia_meses
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.status IN ('inativo', 'evadido')
      AND a.tempo_permanencia_meses >= 4
      AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
      AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
),
permanencia_calc AS (
    SELECT 
        unidade_id,
        ROUND(AVG(meses), 1) AS tempo_permanencia_medio,
        COUNT(*) AS total_evasoes_calc
    FROM permanencia_combinada
    GROUP BY unidade_id
),
evasoes_dedup AS (
    SELECT DISTINCT ON (COALESCE(e.aluno_id, -e.id), e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao))
        e.id, e.aluno_id, e.unidade_id, e.data_evasao, e.tipo_saida_id, e.valor_parcela
    FROM evasoes_v2 e
    ORDER BY COALESCE(e.aluno_id, -e.id), e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao), e.data_evasao DESC
),
evasoes_mes AS (
    SELECT 
        e.unidade_id,
        EXTRACT(year FROM e.data_evasao)::integer AS ano,
        EXTRACT(month FROM e.data_evasao)::integer AS mes,
        COUNT(*) AS total_evasoes
    FROM evasoes_dedup e
    GROUP BY e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao)
),
leads_mes AS (
    SELECT 
        l.unidade_id,
        EXTRACT(year FROM l.data_contato)::integer AS ano,
        EXTRACT(month FROM l.data_contato)::integer AS mes,
        SUM(CASE WHEN l.status IN ('novo', 'agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
        SUM(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
        SUM(CASE WHEN l.status IN ('experimental_realizada', 'compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
        SUM(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
        SUM(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
    FROM leads l
    GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
renovacoes_mes AS (
    SELECT 
        r.unidade_id,
        EXTRACT(year FROM r.data_renovacao)::integer AS ano,
        EXTRACT(month FROM r.data_renovacao)::integer AS mes,
        COUNT(*) FILTER (WHERE r.status = 'renovado') AS renovacoes,
        COUNT(*) AS total_contratos,
        AVG(r.percentual_reajuste) FILTER (WHERE r.status = 'renovado') AS reajuste_medio
    FROM renovacoes r
    GROUP BY r.unidade_id, EXTRACT(year FROM r.data_renovacao), EXTRACT(month FROM r.data_renovacao)
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
    COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
    COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
    COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
    COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,
    COALESCE(am.total_banda, 0)::integer AS total_banda,
    COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,
    COALESCE(tpu.ticket_medio_calculado, 0)::numeric(10,2) AS ticket_medio,
    COALESCE(am.mrr, 0)::numeric(12,2) AS mrr,
    (COALESCE(am.mrr, 0) * 12)::numeric(14,2) AS arr,
    COALESCE(pc.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia_medio,
    (COALESCE(tpu.ticket_medio_calculado, 0) * COALESCE(pc.tempo_permanencia_medio, 0))::numeric(12,2) AS ltv_medio,
    CASE WHEN COALESCE(am.alunos_pagantes, 0) > 0 
        THEN ROUND(COALESCE(am.qtd_inadimplentes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
        ELSE 0 
    END::numeric(5,2) AS inadimplencia_pct,
    COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_previsto,
    (COALESCE(am.mrr, 0) - COALESCE(am.mrr_inadimplente, 0))::numeric(12,2) AS faturamento_realizado,
    COALESCE(lm.total_leads, 0)::integer AS total_leads,
    COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
    COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,
    COALESCE(mm.novas_matriculas, 0)::integer AS novas_matriculas,
    COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
    CASE 
        WHEN COALESCE(da.alunos_pagantes, 0) > 0 THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / da.alunos_pagantes::numeric * 100, 2)
        WHEN COALESCE(am.alunos_pagantes, 0) > 0 THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
        ELSE 0 
    END::numeric(5,2) AS churn_rate,
    COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
    CASE WHEN COALESCE(rm.total_contratos, 0) > 0 
        THEN ROUND(rm.renovacoes::numeric / rm.total_contratos::numeric * 100, 2)
        ELSE 0 
    END::numeric(5,2) AS taxa_renovacao,
    COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN ticket_por_unidade tpu ON tpu.unidade_id = u.id
LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id 
    AND mm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) 
    AND mm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id 
    AND em.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) 
    AND em.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id 
    AND rm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) 
    AND rm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN dados_anterior da ON da.unidade_id = u.id 
    AND da.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) 
    AND da.mes = (COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) - 1)
WHERE u.ativo = true;
