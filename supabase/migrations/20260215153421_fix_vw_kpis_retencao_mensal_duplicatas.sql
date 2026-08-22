-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir view para evitar duplicatas
-- O problema era o CROSS JOIN com periodos que não filtrava por unidade_id
CREATE OR REPLACE VIEW vw_kpis_retencao_mensal AS
WITH evasoes_dedup AS (
  SELECT DISTINCT ON (e.aluno_id, e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao))
    e.id, e.aluno_id, e.unidade_id, e.data_evasao, e.tipo_saida_id, e.valor_parcela
  FROM evasoes_v2 e
  ORDER BY e.aluno_id, e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao), e.data_evasao DESC
),
evasoes_mes AS (
  SELECT 
    e.unidade_id,
    EXTRACT(year FROM e.data_evasao)::int AS ano,
    EXTRACT(month FROM e.data_evasao)::int AS mes,
    COUNT(*) AS total_evasoes,
    COUNT(*) FILTER (WHERE e.tipo_saida_id = 1) AS evasoes_interrompidas,
    COUNT(*) FILTER (WHERE e.tipo_saida_id = 3) AS avisos_previos,
    COUNT(*) FILTER (WHERE e.tipo_saida_id = 4) AS transferencias,
    COUNT(*) FILTER (WHERE e.tipo_saida_id = 2) AS nao_renovacoes_evasao,
    SUM(e.valor_parcela) AS mrr_perdido
  FROM evasoes_dedup e
  GROUP BY e.unidade_id, EXTRACT(year FROM e.data_evasao), EXTRACT(month FROM e.data_evasao)
),
renovacoes_mes AS (
  SELECT 
    r.unidade_id,
    EXTRACT(year FROM r.data_renovacao)::int AS ano,
    EXTRACT(month FROM r.data_renovacao)::int AS mes,
    COUNT(*) AS renovacoes_previstas,
    COUNT(*) FILTER (WHERE r.status = 'renovado') AS renovacoes_realizadas,
    COUNT(*) FILTER (WHERE r.status IN ('nao_renovado', 'nao_renovada')) AS nao_renovacoes_renovacao,
    COUNT(*) FILTER (WHERE r.status = 'pendente') AS renovacoes_pendentes,
    COUNT(*) FILTER (WHERE r.status = 'pendente' AND r.data_renovacao < CURRENT_DATE) AS renovacoes_atrasadas
  FROM renovacoes r
  GROUP BY r.unidade_id, EXTRACT(year FROM r.data_renovacao), EXTRACT(month FROM r.data_renovacao)
),
-- CORREÇÃO: Usar UNION com unidade_id para evitar duplicatas no CROSS JOIN
periodos AS (
  SELECT DISTINCT unidade_id, ano, mes FROM evasoes_mes
  UNION
  SELECT DISTINCT unidade_id, ano, mes FROM renovacoes_mes
),
total_alunos AS (
  SELECT 
    a.unidade_id,
    COUNT(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
)
SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  p.ano,
  p.mes,
  COALESCE(em.total_evasoes, 0)::int AS total_evasoes,
  COALESCE(em.evasoes_interrompidas, 0)::int AS evasoes_interrompidas,
  COALESCE(em.avisos_previos, 0)::int AS avisos_previos,
  COALESCE(em.transferencias, 0)::int AS transferencias,
  CASE 
    WHEN COALESCE(ta.total_pagantes, 0) > 0 
    THEN ((COALESCE(em.total_evasoes, 0) - COALESCE(em.transferencias, 0))::numeric / ta.total_pagantes * 100)::numeric(5,2)
    ELSE 0
  END AS taxa_evasao,
  COALESCE(em.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
  COALESCE(rm.renovacoes_previstas, 0)::int AS renovacoes_previstas,
  COALESCE(rm.renovacoes_realizadas, 0)::int AS renovacoes_realizadas,
  GREATEST(COALESCE(em.nao_renovacoes_evasao, 0), COALESCE(rm.nao_renovacoes_renovacao, 0))::int AS nao_renovacoes,
  COALESCE(rm.renovacoes_pendentes, 0)::int AS renovacoes_pendentes,
  COALESCE(rm.renovacoes_atrasadas, 0)::int AS renovacoes_atrasadas,
  CASE 
    WHEN COALESCE(rm.renovacoes_previstas, 0) > 0 
    THEN (COALESCE(rm.renovacoes_realizadas, 0)::numeric / rm.renovacoes_previstas * 100)::numeric(5,2)
    ELSE 0
  END AS taxa_renovacao,
  CASE 
    WHEN COALESCE(rm.renovacoes_previstas, 0) > 0 
    THEN (COALESCE(rm.nao_renovacoes_renovacao, 0)::numeric / rm.renovacoes_previstas * 100)::numeric(5,2)
    ELSE 0
  END AS taxa_nao_renovacao
FROM unidades u
-- CORREÇÃO: JOIN direto com periodos usando unidade_id ao invés de CROSS JOIN
INNER JOIN periodos p ON p.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = p.ano AND em.mes = p.mes
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = p.ano AND rm.mes = p.mes
LEFT JOIN total_alunos ta ON ta.unidade_id = u.id
WHERE u.ativo = true;
