-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir vw_dashboard_unidade:
-- 1. Deduplicar evasoes_v2 por aluno no mês atual
-- 2. Churn: fallback para alunos_pagantes atuais quando dados_mensais do mês anterior não existe

CREATE OR REPLACE VIEW vw_dashboard_unidade AS
WITH alunos_ativos AS (
  SELECT a.unidade_id,
    count(*) FILTER (WHERE (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_ativos,
    count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_pagantes,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
),
permanencia_combinada AS (
  SELECT unidade_id AS uid, tempo_permanencia_meses AS meses
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
  SELECT uid AS unidade_id,
    round(avg(meses)::numeric, 1) AS tempo_permanencia_medio,
    count(*) AS total_evasoes_calc
  FROM permanencia_combinada
  GROUP BY uid
),
-- CORRIGIDO: deduplicar evasões por aluno no mês atual
evasoes_dedup AS (
  SELECT DISTINCT ON (e.aluno_id, e.unidade_id)
    e.aluno_id, e.unidade_id, e.data_evasao
  FROM evasoes_v2 e
  WHERE EXTRACT(year FROM e.data_evasao) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM e.data_evasao) = EXTRACT(month FROM CURRENT_DATE)
  ORDER BY e.aluno_id, e.unidade_id, e.data_evasao DESC
),
evasoes_mes AS (
  SELECT unidade_id, count(*) AS evasoes_realtime
  FROM evasoes_dedup
  GROUP BY unidade_id
),
matriculas_mes AS (
  SELECT a.unidade_id, count(*) AS matriculas_realtime
  FROM alunos a
  WHERE a.data_matricula IS NOT NULL
    AND EXTRACT(year FROM a.data_matricula) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM a.data_matricula) = EXTRACT(month FROM CURRENT_DATE)
  GROUP BY a.unidade_id
),
renovacoes_mes AS (
  SELECT unidade_id,
    count(*) AS renovacoes_realtime,
    avg(percentual_reajuste) AS reajuste_medio
  FROM renovacoes
  WHERE EXTRACT(year FROM data_renovacao) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM data_renovacao) = EXTRACT(month FROM CURRENT_DATE)
    AND status = 'renovado'
  GROUP BY unidade_id
),
contratos_vencer AS (
  SELECT unidade_id, count(*) AS total_vencer
  FROM alunos
  WHERE status IN ('ativo', 'trancado')
    AND EXTRACT(year FROM data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE)
  GROUP BY unidade_id
),
alunos_mes_anterior AS (
  SELECT unidade_id, alunos_pagantes
  FROM dados_mensais
  WHERE (ano::numeric = EXTRACT(year FROM CURRENT_DATE) AND mes::numeric = EXTRACT(month FROM CURRENT_DATE) - 1)
     OR (ano::numeric = EXTRACT(year FROM CURRENT_DATE) - 1 AND mes = 12 AND EXTRACT(month FROM CURRENT_DATE) = 1)
  GROUP BY unidade_id, alunos_pagantes
),
inadimplencia_atual AS (
  SELECT a.unidade_id,
    count(*) FILTER (WHERE a.status_pagamento = 'inadimplente') AS qtd_inadimplentes,
    count(*) FILTER (WHERE COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS total_pagantes_calc
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
    AND (tm.conta_como_pagante = true OR tm.id IS NULL)
  GROUP BY a.unidade_id
)
SELECT u.id AS unidade_id,
  u.nome AS unidade_nome,
  u.codigo,
  COALESCE(aa.total_ativos, 0)::integer AS alunos_ativos,
  COALESCE(aa.total_pagantes, 0)::integer AS alunos_pagantes,
  COALESCE(aa.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(aa.mrr, 0)::numeric(12,2) AS mrr,
  COALESCE(mm.matriculas_realtime, 0)::integer AS matriculas_mes,
  COALESCE(em.evasoes_realtime, 0)::integer AS evasoes_mes,
  -- CORRIGIDO: fallback para alunos_pagantes atuais quando dados_mensais do mês anterior não existe
  (CASE 
    WHEN COALESCE(ama.alunos_pagantes, 0) > 0
      THEN round(COALESCE(em.evasoes_realtime, 0)::numeric / ama.alunos_pagantes::numeric * 100, 2)
    WHEN COALESCE(aa.total_pagantes, 0) > 0
      THEN round(COALESCE(em.evasoes_realtime, 0)::numeric / aa.total_pagantes::numeric * 100, 2)
    ELSE 0 
  END)::numeric(5,2) AS churn_rate,
  (CASE WHEN COALESCE(cv.total_vencer, 0) > 0
    THEN round(COALESCE(rm.renovacoes_realtime, 0)::numeric / cv.total_vencer::numeric * 100, 2)
    ELSE 0 END)::numeric(5,2) AS taxa_renovacao,
  (CASE WHEN COALESCE(ia.total_pagantes_calc, 0) > 0
    THEN round(COALESCE(ia.qtd_inadimplentes, 0)::numeric / ia.total_pagantes_calc::numeric * 100, 2)
    ELSE 0 END)::numeric(5,2) AS inadimplencia_pct,
  COALESCE(pc.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia,
  COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id
LEFT JOIN contratos_vencer cv ON cv.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN inadimplencia_atual ia ON ia.unidade_id = u.id
WHERE u.ativo = true;
