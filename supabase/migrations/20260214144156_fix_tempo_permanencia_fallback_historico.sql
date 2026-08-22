-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- CORREÇÃO: Tempo de Permanência com fallback histórico
-- =====================================================
-- Quando a unidade não tem evasões na evasoes_v2,
-- usar o último valor disponível na dados_mensais.
-- Conforme a unidade for lançando evasões, o valor
-- calculado em tempo real substitui o fallback.
-- =====================================================

-- 1) Atualizar RPC get_tempo_permanencia com fallback
CREATE OR REPLACE FUNCTION get_tempo_permanencia(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT NULL,
  p_mes INTEGER DEFAULT NULL
)
RETURNS TABLE (
  unidade_id UUID,
  unidade_nome TEXT,
  tempo_permanencia_medio NUMERIC,
  total_evasoes_elegiveis INTEGER,
  soma_meses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH evasoes_elegiveis AS (
    SELECT 
      e.unidade_id,
      a.tempo_permanencia_meses
    FROM evasoes_v2 e
    JOIN alunos a ON a.id = e.aluno_id
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE 
      (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
      AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
      AND a.tempo_permanencia_meses >= 4
      AND (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
      AND (p_ano IS NULL OR EXTRACT(YEAR FROM e.data_evasao) = p_ano)
      AND (p_mes IS NULL OR EXTRACT(MONTH FROM e.data_evasao) = p_mes)
  ),
  calc_evasoes AS (
    SELECT 
      u.id AS uid,
      COALESCE(ROUND(AVG(ee.tempo_permanencia_meses)::NUMERIC, 1), 0) AS tp_medio,
      COALESCE(COUNT(ee.tempo_permanencia_meses)::INTEGER, 0) AS total_el,
      COALESCE(SUM(ee.tempo_permanencia_meses)::INTEGER, 0) AS soma_m
    FROM unidades u
    LEFT JOIN evasoes_elegiveis ee ON ee.unidade_id = u.id
    WHERE u.ativo = true
    GROUP BY u.id
  ),
  -- Fallback: último tempo_permanencia disponível na dados_mensais por unidade
  ultimo_historico AS (
    SELECT DISTINCT ON (dm.unidade_id)
      dm.unidade_id AS uid,
      dm.tempo_permanencia AS tp_historico
    FROM dados_mensais dm
    WHERE dm.tempo_permanencia IS NOT NULL 
      AND dm.tempo_permanencia > 0
    ORDER BY dm.unidade_id, dm.ano DESC, dm.mes DESC
  )
  SELECT 
    u.id AS unidade_id,
    u.nome::TEXT AS unidade_nome,
    CASE 
      WHEN ce.total_el > 0 THEN ce.tp_medio
      WHEN uh.tp_historico IS NOT NULL THEN uh.tp_historico::NUMERIC
      ELSE 0
    END AS tempo_permanencia_medio,
    ce.total_el AS total_evasoes_elegiveis,
    ce.soma_m AS soma_meses
  FROM unidades u
  JOIN calc_evasoes ce ON ce.uid = u.id
  LEFT JOIN ultimo_historico uh ON uh.uid = u.id
  WHERE u.ativo = true;
END;
$$;

-- 2) Recriar vw_dashboard_unidade com fallback histórico
CREATE OR REPLACE VIEW vw_dashboard_unidade AS
WITH alunos_ativos AS (
  SELECT 
    a.unidade_id,
    count(*) FILTER (WHERE a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AS total_ativos,
    count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_pagantes,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true AND COALESCE(a.status_pagamento, '') != 'sem_parcela') AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') != 'sem_parcela') AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
),
permanencia_evasoes AS (
  SELECT 
    e.unidade_id,
    ROUND(AVG(a.tempo_permanencia_meses)::NUMERIC, 1) AS tempo_permanencia_medio,
    COUNT(*) AS total_evasoes_calc
  FROM evasoes_v2 e
  JOIN alunos a ON a.id = e.aluno_id
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
    AND a.tempo_permanencia_meses >= 4
  GROUP BY e.unidade_id
),
-- Fallback: último tempo_permanencia da dados_mensais
ultimo_historico AS (
  SELECT DISTINCT ON (dm.unidade_id)
    dm.unidade_id,
    dm.tempo_permanencia AS tp_historico
  FROM dados_mensais dm
  WHERE dm.tempo_permanencia IS NOT NULL AND dm.tempo_permanencia > 0
  ORDER BY dm.unidade_id, dm.ano DESC, dm.mes DESC
),
evasoes_mes AS (
  SELECT e.unidade_id, count(*) AS evasoes_realtime
  FROM evasoes_v2 e
  WHERE EXTRACT(YEAR FROM e.data_evasao) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.data_evasao) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY e.unidade_id
),
matriculas_mes AS (
  SELECT a.unidade_id, count(*) AS matriculas_realtime
  FROM alunos a
  WHERE a.data_matricula IS NOT NULL
    AND EXTRACT(YEAR FROM a.data_matricula) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM a.data_matricula) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY a.unidade_id
),
renovacoes_mes AS (
  SELECT unidade_id, count(*) AS renovacoes_realtime, avg(percentual_reajuste) AS reajuste_medio
  FROM renovacoes
  WHERE EXTRACT(YEAR FROM data_renovacao) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data_renovacao) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND status = 'renovado'
  GROUP BY unidade_id
),
contratos_vencer AS (
  SELECT unidade_id, count(*) AS total_vencer
  FROM alunos
  WHERE status IN ('ativo', 'trancado')
    AND EXTRACT(YEAR FROM data_fim_contrato) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data_fim_contrato) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY unidade_id
),
alunos_mes_anterior AS (
  SELECT unidade_id, alunos_pagantes
  FROM dados_mensais
  WHERE (ano::numeric = EXTRACT(YEAR FROM CURRENT_DATE) AND mes::numeric = EXTRACT(MONTH FROM CURRENT_DATE) - 1)
     OR (ano::numeric = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND mes = 12 AND EXTRACT(MONTH FROM CURRENT_DATE) = 1)
  GROUP BY unidade_id, alunos_pagantes
),
inadimplencia_atual AS (
  SELECT 
    a.unidade_id,
    count(*) FILTER (WHERE a.status_pagamento = 'inadimplente') AS qtd_inadimplentes,
    count(*) FILTER (WHERE COALESCE(a.status_pagamento, '') != 'sem_parcela') AS total_pagantes_calc
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
  COALESCE(aa.total_ativos, 0)::integer AS alunos_ativos,
  COALESCE(aa.total_pagantes, 0)::integer AS alunos_pagantes,
  COALESCE(aa.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(aa.mrr, 0)::numeric(12,2) AS mrr,
  COALESCE(mm.matriculas_realtime, 0)::integer AS matriculas_mes,
  COALESCE(em.evasoes_realtime, 0)::integer AS evasoes_mes,
  CASE WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
    THEN round(COALESCE(em.evasoes_realtime, 0)::numeric / ama.alunos_pagantes::numeric * 100, 2)
    ELSE 0 
  END::numeric(5,2) AS churn_rate,
  CASE WHEN COALESCE(cv.total_vencer, 0) > 0 
    THEN round(COALESCE(rm.renovacoes_realtime, 0)::numeric / cv.total_vencer::numeric * 100, 2)
    ELSE 0 
  END::numeric(5,2) AS taxa_renovacao,
  CASE WHEN COALESCE(ia.total_pagantes_calc, 0) > 0 
    THEN round(COALESCE(ia.qtd_inadimplentes, 0)::numeric / ia.total_pagantes_calc::numeric * 100, 2)
    ELSE 0 
  END::numeric(5,2) AS inadimplencia_pct,
  -- Tempo permanência: evasoes_v2 se tem dados, senão fallback dados_mensais
  CASE 
    WHEN COALESCE(pe.total_evasoes_calc, 0) > 0 THEN pe.tempo_permanencia_medio
    WHEN uh.tp_historico IS NOT NULL THEN uh.tp_historico::numeric(5,1)
    ELSE 0
  END::numeric(5,1) AS tempo_permanencia,
  COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia_evasoes pe ON pe.unidade_id = u.id
LEFT JOIN ultimo_historico uh ON uh.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id
LEFT JOIN contratos_vencer cv ON cv.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN inadimplencia_atual ia ON ia.unidade_id = u.id
WHERE u.ativo = true;

-- 3) Recriar vw_kpis_gestao_mensal com fallback histórico
CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH matriculas_mes AS (
  SELECT l.unidade_id,
    EXTRACT(YEAR FROM l.data_contato)::integer AS ano,
    EXTRACT(MONTH FROM l.data_contato)::integer AS mes,
    sum(COALESCE(l.quantidade, 1)) AS novas_matriculas
  FROM leads l
  WHERE l.status IN ('matriculado', 'convertido')
    AND (l.tipo_aluno IS NULL OR l.tipo_aluno NOT IN ('bolsista_integral', 'nao_pagante'))
  GROUP BY l.unidade_id, EXTRACT(YEAR FROM l.data_contato), EXTRACT(MONTH FROM l.data_contato)
),
alunos_mes AS (
  SELECT a.unidade_id,
    EXTRACT(YEAR FROM CURRENT_DATE)::integer AS ano,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer AS mes,
    count(*) FILTER (WHERE a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AS total_alunos,
    count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS alunos_pagantes,
    count(*) FILTER (WHERE tm.codigo = 'BOLSISTA_INT' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_integrais,
    count(*) FILTER (WHERE tm.codigo = 'BOLSISTA_PARC' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_parciais,
    count(*) FILTER (WHERE tm.codigo = 'BANDA' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_banda,
    count(*) FILTER (WHERE a.is_segundo_curso = true) AS segundo_curso,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true AND COALESCE(a.status_pagamento, '') != 'sem_parcela') AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') != 'sem_parcela') AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
),
permanencia_evasoes AS (
  SELECT 
    e.unidade_id,
    ROUND(AVG(a.tempo_permanencia_meses)::NUMERIC, 1) AS tempo_permanencia_medio,
    COUNT(*) AS total_evasoes_calc
  FROM evasoes_v2 e
  JOIN alunos a ON a.id = e.aluno_id
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
    AND a.tempo_permanencia_meses >= 4
  GROUP BY e.unidade_id
),
ultimo_historico AS (
  SELECT DISTINCT ON (dm.unidade_id)
    dm.unidade_id,
    dm.tempo_permanencia AS tp_historico
  FROM dados_mensais dm
  WHERE dm.tempo_permanencia IS NOT NULL AND dm.tempo_permanencia > 0
  ORDER BY dm.unidade_id, dm.ano DESC, dm.mes DESC
),
evasoes_mes AS (
  SELECT e.unidade_id,
    EXTRACT(YEAR FROM e.data_evasao)::integer AS ano,
    EXTRACT(MONTH FROM e.data_evasao)::integer AS mes,
    count(*) AS total_evasoes
  FROM evasoes_v2 e
  GROUP BY e.unidade_id, EXTRACT(YEAR FROM e.data_evasao), EXTRACT(MONTH FROM e.data_evasao)
),
leads_mes AS (
  SELECT l.unidade_id,
    EXTRACT(YEAR FROM l.data_contato)::integer AS ano,
    EXTRACT(MONTH FROM l.data_contato)::integer AS mes,
    sum(CASE WHEN l.status IN ('novo', 'agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
    sum(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
    sum(CASE WHEN l.status IN ('experimental_realizada', 'compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
    sum(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
    sum(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
  FROM leads l
  GROUP BY l.unidade_id, EXTRACT(YEAR FROM l.data_contato), EXTRACT(MONTH FROM l.data_contato)
),
renovacoes_mes AS (
  SELECT unidade_id,
    EXTRACT(YEAR FROM data_renovacao)::integer AS ano,
    EXTRACT(MONTH FROM data_renovacao)::integer AS mes,
    count(*) FILTER (WHERE status = 'renovado') AS renovacoes,
    count(*) AS total_contratos,
    avg(percentual_reajuste) FILTER (WHERE status = 'renovado') AS reajuste_medio
  FROM renovacoes
  GROUP BY unidade_id, EXTRACT(YEAR FROM data_renovacao), EXTRACT(MONTH FROM data_renovacao)
),
dados_anterior AS (
  SELECT unidade_id, ano, mes, alunos_pagantes
  FROM dados_mensais
)
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  COALESCE(lm.ano, am.ano, EXTRACT(YEAR FROM CURRENT_DATE)::integer) AS ano,
  COALESCE(lm.mes, am.mes, EXTRACT(MONTH FROM CURRENT_DATE)::integer) AS mes,
  COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
  COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
  COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
  COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,
  COALESCE(am.total_banda, 0)::integer AS total_banda,
  COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,
  COALESCE(am.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(am.mrr, 0)::numeric(12,2) AS mrr,
  (COALESCE(am.mrr, 0) * 12)::numeric(14,2) AS arr,
  -- Tempo permanência com fallback
  (CASE 
    WHEN COALESCE(pe.total_evasoes_calc, 0) > 0 THEN pe.tempo_permanencia_medio
    WHEN uh.tp_historico IS NOT NULL THEN uh.tp_historico::numeric
    ELSE 0
  END)::numeric(5,1) AS tempo_permanencia_medio,
  -- LTV = ticket × tempo permanência (com fallback)
  (COALESCE(am.ticket_medio, 0) * CASE 
    WHEN COALESCE(pe.total_evasoes_calc, 0) > 0 THEN pe.tempo_permanencia_medio
    WHEN uh.tp_historico IS NOT NULL THEN uh.tp_historico::numeric
    ELSE 0
  END)::numeric(12,2) AS ltv_medio,
  0::numeric(5,2) AS inadimplencia_pct,
  COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_previsto,
  COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_realizado,
  COALESCE(lm.total_leads, 0)::integer AS total_leads,
  COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,
  COALESCE(mm.novas_matriculas, 0)::integer AS novas_matriculas,
  COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
  CASE WHEN COALESCE(da.alunos_pagantes, 0) > 0 
    THEN round(COALESCE(em.total_evasoes, 0)::numeric / da.alunos_pagantes::numeric * 100, 2)
    ELSE 0 
  END::numeric(5,2) AS churn_rate,
  COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
  CASE WHEN COALESCE(rm.total_contratos, 0) > 0 
    THEN round(rm.renovacoes::numeric / rm.total_contratos::numeric * 100, 2)
    ELSE 0 
  END::numeric(5,2) AS taxa_renovacao,
  COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN permanencia_evasoes pe ON pe.unidade_id = u.id
LEFT JOIN ultimo_historico uh ON uh.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id 
  AND mm.ano = COALESCE(lm.ano, am.ano, EXTRACT(YEAR FROM CURRENT_DATE)::integer) 
  AND mm.mes = COALESCE(lm.mes, am.mes, EXTRACT(MONTH FROM CURRENT_DATE)::integer)
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id 
  AND em.ano = COALESCE(lm.ano, am.ano, EXTRACT(YEAR FROM CURRENT_DATE)::integer) 
  AND em.mes = COALESCE(lm.mes, am.mes, EXTRACT(MONTH FROM CURRENT_DATE)::integer)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id 
  AND rm.ano = COALESCE(lm.ano, am.ano, EXTRACT(YEAR FROM CURRENT_DATE)::integer) 
  AND rm.mes = COALESCE(lm.mes, am.mes, EXTRACT(MONTH FROM CURRENT_DATE)::integer)
LEFT JOIN dados_anterior da ON da.unidade_id = u.id 
  AND da.ano = COALESCE(lm.ano, am.ano, EXTRACT(YEAR FROM CURRENT_DATE)::integer) 
  AND da.mes = COALESCE(lm.mes, am.mes, EXTRACT(MONTH FROM CURRENT_DATE)::integer) - 1
WHERE u.ativo = true;
