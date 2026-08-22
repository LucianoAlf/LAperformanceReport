-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Recriar view vw_dashboard_unidade com fontes unificadas:
-- 1. Alunos: inclui 'trancado' além de 'ativo'
-- 2. Matrículas: tabela 'alunos' (data_matricula) em vez de 'leads'
-- 3. Evasões: tabela 'evasoes_v2' (data_evasao, unidade_id direto) em vez de 'evasoes' (JOIN por nome)

CREATE OR REPLACE VIEW vw_dashboard_unidade AS
WITH alunos_ativos AS (
    SELECT 
        a.unidade_id,
        count(*) AS total_ativos,
        count(*) FILTER (WHERE tm.conta_como_pagante = true) AS total_pagantes,
        avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
        sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr,
        avg(a.tempo_permanencia_meses) AS tempo_permanencia_medio
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.status IN ('ativo', 'trancado')
    GROUP BY a.unidade_id
),
evasoes_mes AS (
    SELECT 
        e.unidade_id,
        count(*) AS evasoes_realtime
    FROM evasoes_v2 e
    WHERE EXTRACT(year FROM e.data_evasao) = EXTRACT(year FROM CURRENT_DATE)
      AND EXTRACT(month FROM e.data_evasao) = EXTRACT(month FROM CURRENT_DATE)
    GROUP BY e.unidade_id
),
matriculas_mes AS (
    SELECT 
        a.unidade_id,
        count(*) AS matriculas_realtime
    FROM alunos a
    WHERE a.data_matricula IS NOT NULL
      AND EXTRACT(year FROM a.data_matricula) = EXTRACT(year FROM CURRENT_DATE)
      AND EXTRACT(month FROM a.data_matricula) = EXTRACT(month FROM CURRENT_DATE)
    GROUP BY a.unidade_id
),
renovacoes_mes AS (
    SELECT 
        renovacoes.unidade_id,
        count(*) AS renovacoes_realtime,
        avg(renovacoes.percentual_reajuste) AS reajuste_medio
    FROM renovacoes
    WHERE EXTRACT(year FROM renovacoes.data_renovacao) = EXTRACT(year FROM CURRENT_DATE)
      AND EXTRACT(month FROM renovacoes.data_renovacao) = EXTRACT(month FROM CURRENT_DATE)
      AND renovacoes.status = 'renovado'
    GROUP BY renovacoes.unidade_id
),
contratos_vencer AS (
    SELECT 
        alunos.unidade_id,
        count(*) AS total_vencer
    FROM alunos
    WHERE alunos.status IN ('ativo', 'trancado')
      AND EXTRACT(year FROM alunos.data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)
      AND EXTRACT(month FROM alunos.data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE)
    GROUP BY alunos.unidade_id
),
alunos_mes_anterior AS (
    SELECT 
        dados_mensais.unidade_id,
        dados_mensais.alunos_pagantes
    FROM dados_mensais
    WHERE (dados_mensais.ano::numeric = EXTRACT(year FROM CURRENT_DATE) 
           AND dados_mensais.mes::numeric = EXTRACT(month FROM CURRENT_DATE) - 1)
       OR (dados_mensais.ano::numeric = EXTRACT(year FROM CURRENT_DATE) - 1 
           AND dados_mensais.mes = 12 
           AND EXTRACT(month FROM CURRENT_DATE) = 1)
),
inadimplencia_atual AS (
    SELECT 
        a.unidade_id,
        count(*) FILTER (WHERE a.status_pagamento = 'inadimplente') AS qtd_inadimplentes,
        count(*) AS total_pagantes_calc
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.status IN ('ativo', 'trancado')
      AND (tm.conta_como_pagante = true OR tm.id IS NULL)
    GROUP BY a.unidade_id
)
SELECT 
    u.id AS unidade_id,
    u.nome AS unidade_nome,
    u.codigo,
    (COALESCE(aa.total_ativos, 0))::integer AS alunos_ativos,
    (COALESCE(aa.total_pagantes, 0))::integer AS alunos_pagantes,
    (COALESCE(aa.ticket_medio, 0))::numeric(10,2) AS ticket_medio,
    (COALESCE(aa.mrr, 0))::numeric(12,2) AS mrr,
    (COALESCE(mm.matriculas_realtime, 0))::integer AS matriculas_mes,
    (COALESCE(em.evasoes_realtime, 0))::integer AS evasoes_mes,
    (CASE
        WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
        THEN round((COALESCE(em.evasoes_realtime, 0)::numeric / ama.alunos_pagantes::numeric) * 100, 2)
        ELSE 0
    END)::numeric(5,2) AS churn_rate,
    (CASE
        WHEN COALESCE(cv.total_vencer, 0) > 0 
        THEN round((COALESCE(rm.renovacoes_realtime, 0)::numeric / cv.total_vencer::numeric) * 100, 2)
        ELSE 0
    END)::numeric(5,2) AS taxa_renovacao,
    (CASE
        WHEN COALESCE(ia.total_pagantes_calc, 0) > 0 
        THEN round((COALESCE(ia.qtd_inadimplentes, 0)::numeric / ia.total_pagantes_calc::numeric) * 100, 2)
        ELSE 0
    END)::numeric(5,2) AS inadimplencia_pct,
    (COALESCE(aa.tempo_permanencia_medio, 0))::numeric(5,1) AS tempo_permanencia,
    (COALESCE(rm.reajuste_medio, 0))::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id
LEFT JOIN contratos_vencer cv ON cv.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN inadimplencia_atual ia ON ia.unidade_id = u.id
WHERE u.ativo = true;
