-- FASE 3 - PARTE 1: VIEW vw_kpis_gestao_mensal
-- Execute este SQL no Supabase Dashboard > SQL Editor

DROP VIEW IF EXISTS vw_kpis_gestao_mensal;

CREATE VIEW vw_kpis_gestao_mensal AS
WITH alunos_ativos AS (
  SELECT 
    unidade_id,
    COUNT(*) as total_ativos,
    COUNT(*) FILTER (WHERE tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')) as total_pagantes,
    COUNT(*) FILTER (WHERE tipo_aluno = 'Bolsista Integral') as bolsistas_integrais,
    COUNT(*) FILTER (WHERE tipo_aluno = 'Bolsista Parcial') as bolsistas_parciais,
    COUNT(*) FILTER (WHERE tipo_aluno = 'Matrícula em Banda') as banda,
    AVG(valor_parcela) FILTER (WHERE tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')) as ticket_medio,
    SUM(valor_parcela) FILTER (WHERE tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')) as mrr
  FROM alunos
  WHERE status = 'ativo'
  GROUP BY unidade_id
),
permanencia AS (
  SELECT 
    unidade_id,
    AVG(EXTRACT(MONTH FROM AGE(CURRENT_DATE, data_matricula))) as tempo_permanencia_medio
  FROM alunos
  WHERE status = 'ativo'
  GROUP BY unidade_id
),
ltv_calc AS (
  SELECT 
    unidade_id,
    AVG(valor_parcela * EXTRACT(MONTH FROM AGE(CURRENT_DATE, data_matricula))) 
      FILTER (WHERE EXTRACT(MONTH FROM AGE(CURRENT_DATE, data_matricula)) >= 4) as ltv_medio
  FROM alunos
  WHERE status = 'ativo'
    AND tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')
  GROUP BY unidade_id
),
dados_mes AS (
  SELECT 
    unidade_id,
    ano,
    mes,
    alunos_pagantes,
    novas_matriculas,
    evasoes,
    churn_rate,
    ticket_medio as ticket_medio_entrada,
    taxa_renovacao,
    tempo_permanencia,
    inadimplencia,
    faturamento_estimado
  FROM dados_mensais
)
SELECT 
  u.id as unidade_id,
  u.nome as unidade_nome,
  EXTRACT(YEAR FROM CURRENT_DATE)::int as ano,
  EXTRACT(MONTH FROM CURRENT_DATE)::int as mes,
  COALESCE(aa.total_ativos, 0)::bigint as total_alunos_ativos,
  COALESCE(aa.total_pagantes, 0)::bigint as total_alunos_pagantes,
  COALESCE(aa.bolsistas_integrais, 0)::bigint as total_bolsistas_integrais,
  COALESCE(aa.bolsistas_parciais, 0)::bigint as total_bolsistas_parciais,
  COALESCE(aa.banda, 0)::bigint as total_banda,
  COALESCE(aa.ticket_medio, 0)::numeric(10,2) as ticket_medio,
  COALESCE(aa.mrr, 0)::numeric(12,2) as mrr,
  COALESCE(aa.mrr * 12, 0)::numeric(12,2) as arr,
  COALESCE(p.tempo_permanencia_medio, 0)::numeric(5,1) as tempo_permanencia_medio,
  COALESCE(l.ltv_medio, 0)::numeric(10,2) as ltv_medio,
  COALESCE(dm.inadimplencia, 0)::numeric(5,2) as inadimplencia_pct,
  COALESCE(dm.faturamento_estimado, 0)::numeric(12,2) as faturamento_previsto,
  COALESCE(dm.faturamento_estimado * (1 - dm.inadimplencia/100), 0)::numeric(12,2) as faturamento_realizado,
  COALESCE(dm.churn_rate, 0)::numeric(5,2) as churn_rate,
  COALESCE(dm.evasoes, 0)::int as total_evasoes
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia p ON p.unidade_id = u.id
LEFT JOIN ltv_calc l ON l.unidade_id = u.id
LEFT JOIN dados_mes dm ON dm.unidade_id = u.id 
  AND dm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE u.ativo = true;

-- Permissões
GRANT SELECT ON vw_kpis_gestao_mensal TO authenticated;
GRANT SELECT ON vw_kpis_gestao_mensal TO anon;
