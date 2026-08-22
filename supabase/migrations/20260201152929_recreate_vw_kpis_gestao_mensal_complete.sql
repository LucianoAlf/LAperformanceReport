-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Recriar vw_kpis_gestao_mensal com reajuste médio e inadimplência
CREATE VIEW vw_kpis_gestao_mensal AS
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
evasoes_mes_atual AS (
  SELECT u.id as unidade_id, COUNT(*) as evasoes_realtime
  FROM evasoes e
  JOIN unidades u ON u.nome = e.unidade
  WHERE EXTRACT(YEAR FROM e.competencia) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.competencia) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY u.id
),
matriculas_mes_atual AS (
  SELECT unidade_id, COALESCE(SUM(quantidade), 0) as matriculas_realtime
  FROM leads_diarios
  WHERE tipo = 'matricula'
    AND EXTRACT(YEAR FROM data) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data) = EXTRACT(MONTH FROM CURRENT_DATE)
  GROUP BY unidade_id
),
renovacoes_mes_atual AS (
  SELECT unidade_id, 
    COUNT(*) as renovacoes_realtime,
    AVG(percentual_reajuste) as reajuste_medio
  FROM renovacoes
  WHERE EXTRACT(YEAR FROM data_renovacao) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM data_renovacao) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND status = 'renovado'
  GROUP BY unidade_id
),
contratos_vencer_mes AS (
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
  -- Inadimplência em tempo real
  CASE 
    WHEN COALESCE(ia.total_pagantes_calc, 0) > 0 
    THEN ROUND((COALESCE(ia.qtd_inadimplentes, 0)::NUMERIC / ia.total_pagantes_calc) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS inadimplencia_pct,
  -- Quantidade de inadimplentes
  COALESCE(ia.qtd_inadimplentes, 0)::INTEGER AS qtd_inadimplentes,
  -- Faturamento previsto = MRR
  COALESCE(aa.mrr, 0)::NUMERIC(12,2) AS faturamento_previsto,
  -- Faturamento realizado = MRR - (MRR * inadimplência%)
  CASE 
    WHEN COALESCE(ia.total_pagantes_calc, 0) > 0 
    THEN COALESCE(aa.mrr, 0) * (1 - (COALESCE(ia.qtd_inadimplentes, 0)::NUMERIC / ia.total_pagantes_calc))
    ELSE COALESCE(aa.mrr, 0)
  END::NUMERIC(12,2) AS faturamento_realizado,
  -- Churn em tempo real
  CASE 
    WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
    THEN ROUND((COALESCE(ema.evasoes_realtime, 0)::NUMERIC / ama.alunos_pagantes) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS churn_rate,
  COALESCE(ema.evasoes_realtime, 0)::INTEGER AS total_evasoes,
  COALESCE(mma.matriculas_realtime, 0)::INTEGER AS novas_matriculas,
  (COALESCE(mma.matriculas_realtime, 0) - COALESCE(ema.evasoes_realtime, 0))::INTEGER AS saldo_liquido,
  -- Taxa renovação em tempo real
  CASE 
    WHEN COALESCE(cvm.total_vencer, 0) > 0 
    THEN ROUND((COALESCE(rma.renovacoes_realtime, 0)::NUMERIC / cvm.total_vencer) * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS taxa_renovacao,
  COALESCE(rma.renovacoes_realtime, 0)::INTEGER AS renovacoes_realizadas,
  COALESCE(cvm.total_vencer, 0)::INTEGER AS contratos_vencer,
  -- Reajuste médio em tempo real
  COALESCE(rma.reajuste_medio, 0)::NUMERIC(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia p ON p.unidade_id = u.id
LEFT JOIN ltv_calc l ON l.unidade_id = u.id
LEFT JOIN evasoes_mes_atual ema ON ema.unidade_id = u.id
LEFT JOIN matriculas_mes_atual mma ON mma.unidade_id = u.id
LEFT JOIN renovacoes_mes_atual rma ON rma.unidade_id = u.id
LEFT JOIN contratos_vencer_mes cvm ON cvm.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN inadimplencia_atual ia ON ia.unidade_id = u.id
WHERE u.ativo = true;
