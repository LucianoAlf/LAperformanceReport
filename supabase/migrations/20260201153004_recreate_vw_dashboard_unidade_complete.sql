-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Recriar vw_dashboard_unidade com inadimplência e reajuste
CREATE VIEW vw_dashboard_unidade AS
WITH alunos_ativos AS (
  SELECT a.unidade_id,
    count(*) AS total_ativos,
    count(*) FILTER (WHERE tm.conta_como_pagante = true) AS total_pagantes,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr,
    avg(a.tempo_permanencia_meses) AS tempo_permanencia_medio
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
),
evasoes_mes AS (
  SELECT u.id as unidade_id, COUNT(*) as evasoes_realtime
  FROM evasoes e
  JOIN unidades u ON u.nome = e.unidade
  WHERE EXTRACT(YEAR FROM e.competencia) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.competencia) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY u.id
),
matriculas_mes AS (
  SELECT unidade_id, COALESCE(SUM(quantidade), 0) as matriculas_realtime
  FROM leads_diarios
  WHERE tipo = 'matricula'
    AND EXTRACT(YEAR FROM data) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY unidade_id
),
renovacoes_mes AS (
  SELECT unidade_id, 
    COUNT(*) as renovacoes_realtime,
    AVG(percentual_reajuste) as reajuste_medio
  FROM renovacoes
  WHERE EXTRACT(YEAR FROM data_renovacao) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data_renovacao) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND status = 'renovado'
  GROUP BY unidade_id
),
contratos_vencer AS (
  SELECT unidade_id, COUNT(*) as total_vencer
  FROM alunos
  WHERE status = 'ativo'
    AND EXTRACT(YEAR FROM data_fim_contrato) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data_fim_contrato) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY unidade_id
),
alunos_mes_anterior AS (
  SELECT unidade_id, alunos_pagantes
  FROM dados_mensais
  WHERE (ano = EXTRACT(YEAR FROM CURRENT_DATE) AND mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1)
     OR (ano = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND mes = 12 AND EXTRACT(MONTH FROM CURRENT_DATE) = 1)
),
inadimplencia_atual AS (
  SELECT a.unidade_id,
    COUNT(*) FILTER (WHERE a.status_pagamento = 'inadimplente') as qtd_inadimplentes,
    COUNT(*) as total_pagantes_calc
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo' AND (tm.conta_como_pagante = true OR tm.id IS NULL)
  GROUP BY a.unidade_id
)
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  u.codigo,
  COALESCE(aa.total_ativos, 0)::INTEGER AS alunos_ativos,
  COALESCE(aa.total_pagantes, 0)::INTEGER AS alunos_pagantes,
  COALESCE(aa.ticket_medio, 0)::NUMERIC(10,2) AS ticket_medio,
  COALESCE(aa.mrr, 0)::NUMERIC(12,2) AS mrr,
  COALESCE(mm.matriculas_realtime, 0)::INTEGER AS matriculas_mes,
  COALESCE(em.evasoes_realtime, 0)::INTEGER AS evasoes_mes,
  -- Churn em tempo real
  CASE 
    WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
    THEN ROUND((COALESCE(em.evasoes_realtime, 0)::NUMERIC / ama.alunos_pagantes) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS churn_rate,
  -- Taxa renovação em tempo real
  CASE 
    WHEN COALESCE(cv.total_vencer, 0) > 0 
    THEN ROUND((COALESCE(rm.renovacoes_realtime, 0)::NUMERIC / cv.total_vencer) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS taxa_renovacao,
  -- Inadimplência em tempo real
  CASE 
    WHEN COALESCE(ia.total_pagantes_calc, 0) > 0 
    THEN ROUND((COALESCE(ia.qtd_inadimplentes, 0)::NUMERIC / ia.total_pagantes_calc) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS inadimplencia_pct,
  COALESCE(aa.tempo_permanencia_medio, 0)::NUMERIC(5,1) AS tempo_permanencia,
  -- Reajuste médio em tempo real
  COALESCE(rm.reajuste_medio, 0)::NUMERIC(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id
LEFT JOIN contratos_vencer cv ON cv.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN inadimplencia_atual ia ON ia.unidade_id = u.id
WHERE u.ativo = true;
