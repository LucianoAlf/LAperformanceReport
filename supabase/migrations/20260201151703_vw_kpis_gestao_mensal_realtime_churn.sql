-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar view para calcular churn em tempo real
CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH alunos_ativos AS (
  SELECT a.unidade_id,
    count(*) AS total_ativos,
    count(*) FILTER (WHERE tm.conta_como_pagante = true) AS total_pagantes,
    count(*) FILTER (WHERE tm.codigo = 'BOLSISTA_INT') AS bolsistas_integrais,
    count(*) FILTER (WHERE tm.codigo = 'BOLSISTA_PARC') AS bolsistas_parciais,
    count(*) FILTER (WHERE tm.codigo = 'BANDA') AS banda,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
),
permanencia AS (
  SELECT unidade_id, avg(tempo_permanencia_meses) AS tempo_permanencia_medio
  FROM alunos WHERE status = 'ativo'
  GROUP BY unidade_id
),
ltv_calc AS (
  SELECT a.unidade_id,
    avg(a.valor_parcela * a.tempo_permanencia_meses) FILTER (WHERE a.tempo_permanencia_meses >= 4 AND tm.entra_ltv = true) AS ltv_medio
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
),
-- NOVO: Calcular evasões do mês atual em tempo real
evasoes_mes_atual AS (
  SELECT u.id as unidade_id, COUNT(*) as evasoes_realtime
  FROM evasoes e
  JOIN unidades u ON u.nome = e.unidade
  WHERE EXTRACT(YEAR FROM e.competencia) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.competencia) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY u.id
),
-- NOVO: Calcular matrículas do mês atual em tempo real
matriculas_mes_atual AS (
  SELECT unidade_id, COALESCE(SUM(quantidade), 0) as matriculas_realtime
  FROM leads_diarios
  WHERE tipo = 'matricula'
    AND EXTRACT(YEAR FROM data) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY unidade_id
),
-- Pegar alunos do mês anterior para calcular churn
alunos_mes_anterior AS (
  SELECT unidade_id, alunos_pagantes
  FROM dados_mensais
  WHERE (ano = EXTRACT(YEAR FROM CURRENT_DATE) AND mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1)
     OR (ano = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND mes = 12 AND EXTRACT(MONTH FROM CURRENT_DATE) = 1)
),
dados_mes AS (
  SELECT unidade_id, ano, mes, alunos_pagantes, novas_matriculas, evasoes,
    churn_rate, ticket_medio, taxa_renovacao, tempo_permanencia,
    inadimplencia, faturamento_estimado
  FROM dados_mensais
)
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS ano,
  EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER AS mes,
  COALESCE(aa.total_ativos, 0)::BIGINT AS total_alunos_ativos,
  COALESCE(aa.total_pagantes, 0)::BIGINT AS total_alunos_pagantes,
  COALESCE(aa.bolsistas_integrais, 0)::BIGINT AS total_bolsistas_integrais,
  COALESCE(aa.bolsistas_parciais, 0)::BIGINT AS total_bolsistas_parciais,
  COALESCE(aa.banda, 0)::BIGINT AS total_banda,
  COALESCE(aa.ticket_medio, 0)::NUMERIC(10,2) AS ticket_medio,
  COALESCE(aa.mrr, 0)::NUMERIC(12,2) AS mrr,
  COALESCE(aa.mrr * 12, 0)::NUMERIC(12,2) AS arr,
  COALESCE(p.tempo_permanencia_medio, 0)::NUMERIC(5,1) AS tempo_permanencia_medio,
  COALESCE(l.ltv_medio, 0)::NUMERIC(10,2) AS ltv_medio,
  COALESCE(dm.inadimplencia, 0)::NUMERIC(5,2) AS inadimplencia_pct,
  COALESCE(dm.faturamento_estimado, 0)::NUMERIC(12,2) AS faturamento_previsto,
  COALESCE(dm.faturamento_estimado * (1 - dm.inadimplencia / 100), 0)::NUMERIC(12,2) AS faturamento_realizado,
  -- CHURN EM TEMPO REAL: evasões do mês / alunos do mês anterior * 100
  CASE 
    WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
    THEN ROUND((COALESCE(ema.evasoes_realtime, 0)::NUMERIC / ama.alunos_pagantes) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS churn_rate,
  -- Evasões em tempo real
  COALESCE(ema.evasoes_realtime, 0)::INTEGER AS total_evasoes,
  -- Matrículas em tempo real
  COALESCE(mma.matriculas_realtime, 0)::INTEGER AS novas_matriculas,
  -- Saldo líquido em tempo real
  (COALESCE(mma.matriculas_realtime, 0) - COALESCE(ema.evasoes_realtime, 0))::INTEGER AS saldo_liquido
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia p ON p.unidade_id = u.id
LEFT JOIN ltv_calc l ON l.unidade_id = u.id
LEFT JOIN evasoes_mes_atual ema ON ema.unidade_id = u.id
LEFT JOIN matriculas_mes_atual mma ON mma.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN dados_mes dm ON dm.unidade_id = u.id 
  AND dm.ano = EXTRACT(YEAR FROM CURRENT_DATE) 
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE u.ativo = true;
