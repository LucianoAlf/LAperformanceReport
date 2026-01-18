-- ============================================================
-- FASE 3: VIEWS PARA OS 75 KPIs
-- LA Performance Report - Sistema de Gestão 2026
-- ============================================================

-- ============================================================
-- 1. VIEW: vw_kpis_gestao_mensal
-- KPIs gerais de gestão por unidade e mês
-- ============================================================
DROP VIEW IF EXISTS vw_kpis_gestao_mensal;

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
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
  COALESCE(aa.total_ativos, 0) as total_alunos_ativos,
  COALESCE(aa.total_pagantes, 0) as total_alunos_pagantes,
  COALESCE(aa.bolsistas_integrais, 0) as total_bolsistas_integrais,
  COALESCE(aa.bolsistas_parciais, 0) as total_bolsistas_parciais,
  COALESCE(aa.banda, 0) as total_banda,
  COALESCE(aa.ticket_medio, 0)::numeric(10,2) as ticket_medio,
  COALESCE(aa.mrr, 0)::numeric(12,2) as mrr,
  COALESCE(aa.mrr * 12, 0)::numeric(12,2) as arr,
  COALESCE(p.tempo_permanencia_medio, 0)::numeric(5,1) as tempo_permanencia_medio,
  COALESCE(l.ltv_medio, 0)::numeric(10,2) as ltv_medio,
  COALESCE(dm.inadimplencia, 0)::numeric(5,2) as inadimplencia_pct,
  COALESCE(dm.faturamento_estimado, 0)::numeric(12,2) as faturamento_previsto,
  COALESCE(dm.faturamento_estimado * (1 - dm.inadimplencia/100), 0)::numeric(12,2) as faturamento_realizado,
  COALESCE(dm.churn_rate, 0)::numeric(5,2) as churn_rate,
  COALESCE(dm.evasoes, 0) as total_evasoes
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia p ON p.unidade_id = u.id
LEFT JOIN ltv_calc l ON l.unidade_id = u.id
LEFT JOIN dados_mes dm ON dm.unidade_id = u.id 
  AND dm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE u.ativo = true;

-- ============================================================
-- 2. VIEW: vw_kpis_comercial_mensal
-- KPIs comerciais (Hunters) por unidade e mês
-- ============================================================
DROP VIEW IF EXISTS vw_kpis_comercial_mensal;

CREATE OR REPLACE VIEW vw_kpis_comercial_mensal AS
WITH leads_mes AS (
  SELECT 
    unidade_id,
    EXTRACT(YEAR FROM data_contato)::int as ano,
    EXTRACT(MONTH FROM data_contato)::int as mes,
    COUNT(*) as total_leads,
    COUNT(*) FILTER (WHERE status = 'arquivado') as leads_arquivados,
    COUNT(*) FILTER (WHERE status = 'experimental_agendada') as experimentais_agendadas,
    COUNT(*) FILTER (WHERE status = 'experimental_realizada') as experimentais_realizadas,
    COUNT(*) FILTER (WHERE status = 'matriculado') as matriculados
  FROM leads
  GROUP BY unidade_id, EXTRACT(YEAR FROM data_contato), EXTRACT(MONTH FROM data_contato)
),
leads_por_canal AS (
  SELECT 
    unidade_id,
    EXTRACT(YEAR FROM data_contato)::int as ano,
    EXTRACT(MONTH FROM data_contato)::int as mes,
    jsonb_object_agg(
      COALESCE(canal_origem, 'Outros'), 
      canal_count
    ) as leads_por_canal
  FROM (
    SELECT 
      unidade_id,
      data_contato,
      canal_origem,
      COUNT(*) as canal_count
    FROM leads
    GROUP BY unidade_id, data_contato, canal_origem
  ) sub
  GROUP BY unidade_id, EXTRACT(YEAR FROM data_contato), EXTRACT(MONTH FROM data_contato)
),
matriculas_mes AS (
  SELECT 
    unidade_id,
    EXTRACT(YEAR FROM data_matricula)::int as ano,
    EXTRACT(MONTH FROM data_matricula)::int as mes,
    COUNT(*) as novas_matriculas,
    SUM(valor_parcela) as faturamento_novos,
    AVG(valor_parcela) as ticket_medio_novos
  FROM alunos
  WHERE data_matricula IS NOT NULL
  GROUP BY unidade_id, EXTRACT(YEAR FROM data_matricula), EXTRACT(MONTH FROM data_matricula)
),
matriculas_por_professor AS (
  SELECT 
    a.unidade_id,
    EXTRACT(YEAR FROM a.data_matricula)::int as ano,
    EXTRACT(MONTH FROM a.data_matricula)::int as mes,
    jsonb_object_agg(
      COALESCE(p.nome, 'Sem Professor'), 
      prof_count
    ) as matriculas_por_professor
  FROM (
    SELECT 
      unidade_id,
      data_matricula,
      professor_id,
      COUNT(*) as prof_count
    FROM alunos
    WHERE data_matricula IS NOT NULL
    GROUP BY unidade_id, data_matricula, professor_id
  ) a
  LEFT JOIN professores p ON p.id = a.professor_id
  GROUP BY a.unidade_id, EXTRACT(YEAR FROM a.data_matricula), EXTRACT(MONTH FROM a.data_matricula)
)
SELECT 
  u.id as unidade_id,
  u.nome as unidade_nome,
  COALESCE(lm.ano, EXTRACT(YEAR FROM CURRENT_DATE)::int) as ano,
  COALESCE(lm.mes, EXTRACT(MONTH FROM CURRENT_DATE)::int) as mes,
  COALESCE(lm.total_leads, 0) as total_leads,
  COALESCE(lm.leads_arquivados, 0) as leads_arquivados,
  COALESCE(lm.experimentais_agendadas, 0) as experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0) as experimentais_realizadas,
  COALESCE(lm.experimentais_agendadas - lm.experimentais_realizadas, 0) as faltaram,
  CASE 
    WHEN COALESCE(lm.experimentais_agendadas, 0) > 0 
    THEN (COALESCE(lm.experimentais_realizadas, 0)::numeric / lm.experimentais_agendadas * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_showup,
  COALESCE(mm.novas_matriculas, 0) as novas_matriculas,
  CASE 
    WHEN COALESCE(lm.total_leads, 0) > 0 
    THEN (COALESCE(lm.experimentais_realizadas, 0)::numeric / lm.total_leads * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_conversao_lead_exp,
  CASE 
    WHEN COALESCE(lm.experimentais_realizadas, 0) > 0 
    THEN (COALESCE(mm.novas_matriculas, 0)::numeric / lm.experimentais_realizadas * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_conversao_exp_mat,
  CASE 
    WHEN COALESCE(lm.total_leads, 0) > 0 
    THEN (COALESCE(mm.novas_matriculas, 0)::numeric / lm.total_leads * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_conversao_geral,
  COALESCE(mm.faturamento_novos, 0)::numeric(12,2) as faturamento_novos,
  COALESCE(mm.ticket_medio_novos, 0)::numeric(10,2) as ticket_medio_novos,
  COALESCE(lpc.leads_por_canal, '{}'::jsonb) as leads_por_canal,
  COALESCE(mpp.matriculas_por_professor, '{}'::jsonb) as matriculas_por_professor
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id 
  AND lm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND lm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id 
  AND mm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND mm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN leads_por_canal lpc ON lpc.unidade_id = u.id 
  AND lpc.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND lpc.mes = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN matriculas_por_professor mpp ON mpp.unidade_id = u.id 
  AND mpp.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND mpp.mes = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE u.ativo = true;

-- ============================================================
-- 3. VIEW: vw_kpis_retencao_mensal
-- KPIs de retenção (Farmers) por unidade e mês
-- ============================================================
DROP VIEW IF EXISTS vw_kpis_retencao_mensal;

CREATE OR REPLACE VIEW vw_kpis_retencao_mensal AS
WITH evasoes_mes AS (
  SELECT 
    unidade_id,
    EXTRACT(YEAR FROM data_saida)::int as ano,
    EXTRACT(MONTH FROM data_saida)::int as mes,
    COUNT(*) as total_evasoes,
    COUNT(*) FILTER (WHERE tipo_saida_id IN (SELECT id FROM tipos_saida WHERE nome ILIKE '%interrompido%')) as evasoes_interrompidas,
    COUNT(*) FILTER (WHERE tipo_saida_id IN (SELECT id FROM tipos_saida WHERE nome ILIKE '%aviso%')) as avisos_previos,
    COUNT(*) FILTER (WHERE tipo_saida_id IN (SELECT id FROM tipos_saida WHERE nome ILIKE '%transfer%')) as transferencias,
    SUM(valor_parcela) as mrr_perdido
  FROM evasoes_v2
  GROUP BY unidade_id, EXTRACT(YEAR FROM data_saida), EXTRACT(MONTH FROM data_saida)
),
evasoes_por_motivo AS (
  SELECT 
    e.unidade_id,
    EXTRACT(YEAR FROM e.data_saida)::int as ano,
    EXTRACT(MONTH FROM e.data_saida)::int as mes,
    jsonb_object_agg(
      COALESCE(ms.nome, 'Outros'), 
      motivo_count
    ) as evasoes_por_motivo
  FROM (
    SELECT 
      unidade_id,
      data_saida,
      motivo_saida_id,
      COUNT(*) as motivo_count
    FROM evasoes_v2
    GROUP BY unidade_id, data_saida, motivo_saida_id
  ) e
  LEFT JOIN motivos_saida ms ON ms.id = e.motivo_saida_id
  GROUP BY e.unidade_id, EXTRACT(YEAR FROM e.data_saida), EXTRACT(MONTH FROM e.data_saida)
),
evasoes_por_professor AS (
  SELECT 
    e.unidade_id,
    EXTRACT(YEAR FROM e.data_saida)::int as ano,
    EXTRACT(MONTH FROM e.data_saida)::int as mes,
    jsonb_object_agg(
      COALESCE(p.nome, 'Sem Professor'), 
      prof_count
    ) as evasoes_por_professor
  FROM (
    SELECT 
      unidade_id,
      data_saida,
      professor_id,
      COUNT(*) as prof_count
    FROM evasoes_v2
    GROUP BY unidade_id, data_saida, professor_id
  ) e
  LEFT JOIN professores p ON p.id = e.professor_id
  GROUP BY e.unidade_id, EXTRACT(YEAR FROM e.data_saida), EXTRACT(MONTH FROM e.data_saida)
),
renovacoes_mes AS (
  SELECT 
    unidade_id,
    EXTRACT(YEAR FROM data_vencimento)::int as ano,
    EXTRACT(MONTH FROM data_vencimento)::int as mes,
    COUNT(*) as renovacoes_previstas,
    COUNT(*) FILTER (WHERE status = 'realizada') as renovacoes_realizadas,
    COUNT(*) FILTER (WHERE status = 'nao_renovada') as nao_renovacoes,
    COUNT(*) FILTER (WHERE status = 'pendente') as renovacoes_pendentes,
    COUNT(*) FILTER (WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE) as renovacoes_atrasadas
  FROM renovacoes
  GROUP BY unidade_id, EXTRACT(YEAR FROM data_vencimento), EXTRACT(MONTH FROM data_vencimento)
),
total_alunos AS (
  SELECT 
    unidade_id,
    COUNT(*) as total_ativos
  FROM alunos
  WHERE status = 'ativo'
  GROUP BY unidade_id
)
SELECT 
  u.id as unidade_id,
  u.nome as unidade_nome,
  COALESCE(em.ano, EXTRACT(YEAR FROM CURRENT_DATE)::int) as ano,
  COALESCE(em.mes, EXTRACT(MONTH FROM CURRENT_DATE)::int) as mes,
  COALESCE(em.total_evasoes, 0) as total_evasoes,
  COALESCE(em.evasoes_interrompidas, 0) as evasoes_interrompidas,
  COALESCE(em.avisos_previos, 0) as avisos_previos,
  COALESCE(em.transferencias, 0) as transferencias,
  CASE 
    WHEN COALESCE(ta.total_ativos, 0) > 0 
    THEN ((COALESCE(em.total_evasoes, 0) - COALESCE(em.transferencias, 0))::numeric / ta.total_ativos * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_evasao,
  COALESCE(em.mrr_perdido, 0)::numeric(12,2) as mrr_perdido,
  COALESCE(rm.renovacoes_previstas, 0) as renovacoes_previstas,
  COALESCE(rm.renovacoes_realizadas, 0) as renovacoes_realizadas,
  COALESCE(rm.nao_renovacoes, 0) as nao_renovacoes,
  COALESCE(rm.renovacoes_pendentes, 0) as renovacoes_pendentes,
  COALESCE(rm.renovacoes_atrasadas, 0) as renovacoes_atrasadas,
  CASE 
    WHEN COALESCE(rm.renovacoes_previstas, 0) > 0 
    THEN (COALESCE(rm.renovacoes_realizadas, 0)::numeric / rm.renovacoes_previstas * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_renovacao,
  CASE 
    WHEN COALESCE(rm.renovacoes_previstas, 0) > 0 
    THEN (COALESCE(rm.nao_renovacoes, 0)::numeric / rm.renovacoes_previstas * 100)::numeric(5,2)
    ELSE 0 
  END as taxa_nao_renovacao,
  COALESCE(epm.evasoes_por_motivo, '{}'::jsonb) as evasoes_por_motivo,
  COALESCE(epp.evasoes_por_professor, '{}'::jsonb) as evasoes_por_professor
FROM unidades u
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id 
  AND em.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND em.mes = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id 
  AND rm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND rm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN total_alunos ta ON ta.unidade_id = u.id
LEFT JOIN evasoes_por_motivo epm ON epm.unidade_id = u.id 
  AND epm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND epm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
LEFT JOIN evasoes_por_professor epp ON epp.unidade_id = u.id 
  AND epp.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND epp.mes = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE u.ativo = true;

-- ============================================================
-- 4. VIEW: vw_dashboard_unidade (atualizada)
-- Resumo por unidade para o dashboard principal
-- ============================================================
DROP VIEW IF EXISTS vw_dashboard_unidade;

CREATE OR REPLACE VIEW vw_dashboard_unidade AS
SELECT 
  u.id as unidade_id,
  u.nome as unidade_nome,
  u.codigo,
  COALESCE(aa.total_ativos, 0) as alunos_ativos,
  COALESCE(aa.total_pagantes, 0) as alunos_pagantes,
  COALESCE(aa.ticket_medio, 0)::numeric(10,2) as ticket_medio,
  COALESCE(aa.mrr, 0)::numeric(12,2) as mrr,
  COALESCE(dm.novas_matriculas, 0) as matriculas_mes,
  COALESCE(dm.evasoes, 0) as evasoes_mes,
  COALESCE(dm.churn_rate, 0)::numeric(5,2) as churn_rate,
  COALESCE(dm.taxa_renovacao, 0)::numeric(5,2) as taxa_renovacao,
  COALESCE(dm.inadimplencia, 0)::numeric(5,2) as inadimplencia_pct
FROM unidades u
LEFT JOIN (
  SELECT 
    unidade_id,
    COUNT(*) as total_ativos,
    COUNT(*) FILTER (WHERE tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')) as total_pagantes,
    AVG(valor_parcela) FILTER (WHERE tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')) as ticket_medio,
    SUM(valor_parcela) FILTER (WHERE tipo_aluno NOT IN ('Bolsista Integral', 'Bolsista Parcial', 'Matrícula em Banda')) as mrr
  FROM alunos
  WHERE status = 'ativo'
  GROUP BY unidade_id
) aa ON aa.unidade_id = u.id
LEFT JOIN dados_mensais dm ON dm.unidade_id = u.id 
  AND dm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE)
WHERE u.ativo = true;

-- ============================================================
-- 5. FUNÇÃO: get_kpis_evolucao_mensal
-- Retorna evolução dos KPIs nos últimos N meses
-- ============================================================
CREATE OR REPLACE FUNCTION get_kpis_evolucao_mensal(
  p_unidade_id TEXT DEFAULT NULL,
  p_meses INT DEFAULT 6
)
RETURNS TABLE (
  ano INT,
  mes INT,
  mes_nome TEXT,
  alunos_ativos INT,
  novas_matriculas INT,
  evasoes INT,
  churn_rate NUMERIC,
  ticket_medio NUMERIC,
  mrr NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dm.ano,
    dm.mes,
    TO_CHAR(TO_DATE(dm.mes::text, 'MM'), 'Mon') as mes_nome,
    dm.alunos_pagantes as alunos_ativos,
    dm.novas_matriculas,
    dm.evasoes,
    dm.churn_rate::numeric,
    dm.ticket_medio::numeric,
    (dm.alunos_pagantes * dm.ticket_medio)::numeric as mrr
  FROM dados_mensais dm
  WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ORDER BY dm.ano DESC, dm.mes DESC
  LIMIT p_meses;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================
GRANT SELECT ON vw_kpis_gestao_mensal TO authenticated;
GRANT SELECT ON vw_kpis_comercial_mensal TO authenticated;
GRANT SELECT ON vw_kpis_retencao_mensal TO authenticated;
GRANT SELECT ON vw_dashboard_unidade TO authenticated;
GRANT EXECUTE ON FUNCTION get_kpis_evolucao_mensal TO authenticated;
