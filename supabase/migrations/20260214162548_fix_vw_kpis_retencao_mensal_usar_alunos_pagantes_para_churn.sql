-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir vw_kpis_retencao_mensal: usar alunos_pagantes (sem bolsistas, sem 2º curso)
-- como base para taxa_evasao, alinhando com vw_kpis_gestao_mensal

CREATE OR REPLACE VIEW vw_kpis_retencao_mensal AS
WITH evasoes_dedup AS (
  SELECT DISTINCT ON (e.aluno_id, e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao))
    e.id, e.aluno_id, e.unidade_id, e.data_evasao, e.tipo_saida_id, e.valor_parcela
  FROM evasoes_v2 e
  ORDER BY e.aluno_id, e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao), e.data_evasao DESC
),
evasoes_mes AS (
  SELECT e.unidade_id,
    EXTRACT(year FROM e.data_evasao)::integer AS ano,
    EXTRACT(month FROM e.data_evasao)::integer AS mes,
    count(*) AS total_evasoes,
    count(*) FILTER (WHERE e.tipo_saida_id = 1) AS evasoes_interrompidas,
    count(*) FILTER (WHERE e.tipo_saida_id = 3) AS avisos_previos,
    count(*) FILTER (WHERE e.tipo_saida_id = 4) AS transferencias,
    count(*) FILTER (WHERE e.tipo_saida_id = 2) AS nao_renovacoes_evasao,
    sum(e.valor_parcela) AS mrr_perdido
  FROM evasoes_dedup e
  GROUP BY e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao)
),
renovacoes_mes AS (
  SELECT r.unidade_id,
    EXTRACT(year FROM r.data_renovacao)::integer AS ano,
    EXTRACT(month FROM r.data_renovacao)::integer AS mes,
    count(*) AS renovacoes_previstas,
    count(*) FILTER (WHERE r.status = 'renovado') AS renovacoes_realizadas,
    count(*) FILTER (WHERE r.status IN ('nao_renovado', 'nao_renovada')) AS nao_renovacoes_renovacao,
    count(*) FILTER (WHERE r.status = 'pendente') AS renovacoes_pendentes,
    count(*) FILTER (WHERE r.status = 'pendente' AND r.data_renovacao < CURRENT_DATE) AS renovacoes_atrasadas
  FROM renovacoes r
  GROUP BY r.unidade_id, EXTRACT(year FROM r.data_renovacao), EXTRACT(month FROM r.data_renovacao)
),
periodos AS (
  SELECT unidade_id, ano, mes FROM evasoes_mes
  UNION
  SELECT unidade_id, ano, mes FROM renovacoes_mes
),
-- Usar alunos_pagantes (sem bolsistas, sem 2º curso) como base para churn
total_alunos AS (
  SELECT a.unidade_id,
    count(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
)
SELECT u.id AS unidade_id,
  u.nome AS unidade_nome,
  p.ano,
  p.mes,
  COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
  COALESCE(em.evasoes_interrompidas, 0)::integer AS evasoes_interrompidas,
  COALESCE(em.avisos_previos, 0)::integer AS avisos_previos,
  COALESCE(em.transferencias, 0)::integer AS transferencias,
  CASE WHEN COALESCE(ta.total_pagantes, 0) > 0
    THEN ((COALESCE(em.total_evasoes, 0) - COALESCE(em.transferencias, 0))::numeric / ta.total_pagantes::numeric * 100)::numeric(5,2)
    ELSE 0 END AS taxa_evasao,
  COALESCE(em.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
  COALESCE(rm.renovacoes_previstas, 0)::integer AS renovacoes_previstas,
  COALESCE(rm.renovacoes_realizadas, 0)::integer AS renovacoes_realizadas,
  GREATEST(COALESCE(em.nao_renovacoes_evasao, 0), COALESCE(rm.nao_renovacoes_renovacao, 0))::integer AS nao_renovacoes,
  COALESCE(rm.renovacoes_pendentes, 0)::integer AS renovacoes_pendentes,
  COALESCE(rm.renovacoes_atrasadas, 0)::integer AS renovacoes_atrasadas,
  CASE WHEN COALESCE(rm.renovacoes_previstas, 0) > 0
    THEN (COALESCE(rm.renovacoes_realizadas, 0)::numeric / rm.renovacoes_previstas::numeric * 100)::numeric(5,2)
    ELSE 0 END AS taxa_renovacao,
  CASE WHEN COALESCE(rm.renovacoes_previstas, 0) > 0
    THEN (COALESCE(rm.nao_renovacoes_renovacao, 0)::numeric / rm.renovacoes_previstas::numeric * 100)::numeric(5,2)
    ELSE 0 END AS taxa_nao_renovacao
FROM unidades u
CROSS JOIN periodos p
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = p.ano AND em.mes = p.mes
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = p.ano AND rm.mes = p.mes
LEFT JOIN total_alunos ta ON ta.unidade_id = u.id
WHERE u.ativo = true
  AND (em.unidade_id IS NOT NULL OR rm.unidade_id IS NOT NULL);
