-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir vw_kpis_gestao_mensal:
-- 1. Deduplicar evasoes_v2 por aluno (mesmo fix da vw_kpis_retencao_mensal)
-- 2. Churn: fallback para alunos_pagantes atuais quando dados_mensais do mês anterior não existe

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH matriculas_mes AS (
  SELECT l.unidade_id,
    EXTRACT(year FROM l.data_contato)::integer AS ano,
    EXTRACT(month FROM l.data_contato)::integer AS mes,
    sum(COALESCE(l.quantidade, 1)) AS novas_matriculas
  FROM leads l
  WHERE l.status IN ('matriculado', 'convertido')
    AND (l.tipo_aluno IS NULL OR l.tipo_aluno NOT IN ('bolsista_integral', 'nao_pagante'))
  GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
alunos_mes AS (
  SELECT a.unidade_id,
    EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
    EXTRACT(month FROM CURRENT_DATE)::integer AS mes,
    count(*) FILTER (WHERE (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_alunos,
    count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS alunos_pagantes,
    count(*) FILTER (WHERE tm.codigo = 'BOLSISTA_INT' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_integrais,
    count(*) FILTER (WHERE tm.codigo = 'BOLSISTA_PARC' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS bolsistas_parciais,
    count(*) FILTER (WHERE tm.codigo = 'BANDA' AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_banda,
    count(*) FILTER (WHERE a.is_segundo_curso = true) AS segundo_curso,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS ticket_medio,
    sum(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
),
-- CORRIGIDO: usar alunos_historico + alunos(inativo/evadido)
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
-- CORRIGIDO: deduplicar evasoes por aluno no mesmo mês
evasoes_dedup AS (
  SELECT DISTINCT ON (e.aluno_id, e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao))
    e.id, e.aluno_id, e.unidade_id, e.data_evasao, e.tipo_saida_id, e.valor_parcela
  FROM evasoes_v2 e
  ORDER BY e.aluno_id, e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao), e.data_evasao DESC
),
evasoes_mes AS (
  SELECT e.unidade_id,
    EXTRACT(year FROM e.data_evasao)::integer AS ano,
    EXTRACT(month FROM e.data_evasao)::integer AS mes,
    count(*) AS total_evasoes
  FROM evasoes_dedup e
  GROUP BY e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao)
),
leads_mes AS (
  SELECT l.unidade_id,
    EXTRACT(year FROM l.data_contato)::integer AS ano,
    EXTRACT(month FROM l.data_contato)::integer AS mes,
    sum(CASE WHEN l.status IN ('novo', 'agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
    sum(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
    sum(CASE WHEN l.status IN ('experimental_realizada', 'compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
    sum(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
    sum(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
  FROM leads l
  GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),
renovacoes_mes AS (
  SELECT unidade_id,
    EXTRACT(year FROM data_renovacao)::integer AS ano,
    EXTRACT(month FROM data_renovacao)::integer AS mes,
    count(*) FILTER (WHERE status = 'renovado') AS renovacoes,
    count(*) AS total_contratos,
    avg(percentual_reajuste) FILTER (WHERE status = 'renovado') AS reajuste_medio
  FROM renovacoes
  GROUP BY unidade_id, EXTRACT(year FROM data_renovacao), EXTRACT(month FROM data_renovacao)
),
dados_anterior AS (
  SELECT unidade_id, ano, mes, alunos_pagantes
  FROM dados_mensais
)
SELECT u.id AS unidade_id,
  u.nome AS unidade_nome,
  COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
  COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,
  COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
  COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
  COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
  COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,
  COALESCE(am.total_banda, 0)::integer AS total_banda,
  COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,
  COALESCE(am.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(am.mrr, 0)::numeric(12,2) AS mrr,
  (COALESCE(am.mrr, 0) * 12)::numeric(14,2) AS arr,
  COALESCE(pc.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia_medio,
  (COALESCE(am.ticket_medio, 0) * COALESCE(pc.tempo_permanencia_medio, 0))::numeric(12,2) AS ltv_medio,
  0::numeric(5,2) AS inadimplencia_pct,
  COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_previsto,
  COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_realizado,
  COALESCE(lm.total_leads, 0)::integer AS total_leads,
  COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,
  COALESCE(mm.novas_matriculas, 0)::integer AS novas_matriculas,
  COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
  -- CORRIGIDO: fallback para alunos_pagantes atuais quando dados_mensais do mês anterior não existe
  (CASE 
    WHEN COALESCE(da.alunos_pagantes, 0) > 0 
      THEN round(COALESCE(em.total_evasoes, 0)::numeric / da.alunos_pagantes::numeric * 100, 2)
    WHEN COALESCE(am.alunos_pagantes, 0) > 0
      THEN round(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
    ELSE 0 
  END)::numeric(5,2) AS churn_rate,
  COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
  (CASE WHEN COALESCE(rm.total_contratos, 0) > 0
    THEN round(rm.renovacoes::numeric / rm.total_contratos::numeric * 100, 2)
    ELSE 0 END)::numeric(5,2) AS taxa_renovacao,
  COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id AND mm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND mm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND em.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND rm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN dados_anterior da ON da.unidade_id = u.id AND da.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AND da.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) - 1
WHERE u.ativo = true;
