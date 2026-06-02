-- =============================================================================
-- VALIDACAO_KPI_CG_MAIO2026.sql
-- SQL READ-ONLY para validar os KPIs de Campo Grande / Maio 2026
-- antes de aplicar migration em produção.
-- Resultados esperados (pós-limpeza manual Alf):
--   ativos       = 496
--   pagantes     = 470
--   matriculas   = 561
--   banda        = 41
--   segundo_curso= 27
--   novas        = 23
--   evasoes      = 13
--   churn        = 2,77%
-- =============================================================================

-- ---------------------------------------------------------
-- 0. Helpers (CTE literal — roda no SQL Editor do Supabase)
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid AS unidade_id,
    2026::int AS ano,
    5::int AS mes,
    DATE '2026-05-01' AS inicio_mes,
    DATE '2026-05-31' AS fim_mes
),

snapshot_base AS (
  SELECT
    a.id,
    a.nome,
    a.status,
    a.data_matricula,
    a.data_saida,
    a.valor_parcela,
    a.is_segundo_curso,
    a.tipo_matricula_id,
    a.curso_id,
    a.status_pagamento,
    tm.codigo AS tipo_matricula_codigo,
    tm.conta_como_pagante,
    tm.entra_ticket_medio,
    tm.entra_churn,
    c.is_projeto_banda,
    c.nome AS curso_nome
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN params p
  WHERE a.unidade_id = p.unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
)

-- ---------------------------------------------------------
-- 1. ALUNOS ATIVOS (por pessoa)
-- ---------------------------------------------------------
SELECT
  'alunos_ativos' AS kpi,
  COUNT(DISTINCT nome) AS valor,
  496 AS esperado,
  CASE WHEN COUNT(DISTINCT nome) = 496 THEN 'OK' ELSE 'DIVERGENCIA' END AS status
FROM snapshot_base

UNION ALL

-- ---------------------------------------------------------
-- 2. ALUNOS PAGANTES (por pessoa, pelo menos 1 linha pagante)
-- ---------------------------------------------------------
SELECT
  'alunos_pagantes',
  COUNT(DISTINCT nome) FILTER (WHERE conta_como_pagante = true),
  470,
  CASE WHEN COUNT(DISTINCT nome) FILTER (WHERE conta_como_pagante = true) = 470 THEN 'OK' ELSE 'DIVERGENCIA' END
FROM snapshot_base

UNION ALL

-- ---------------------------------------------------------
-- 3. MATRICULAS ATIVAS (todas as linhas no snapshot)
-- ---------------------------------------------------------
SELECT
  'matriculas_ativas',
  COUNT(*),
  561,
  CASE WHEN COUNT(*) = 561 THEN 'OK' ELSE 'DIVERGENCIA' END
FROM snapshot_base

UNION ALL

-- ---------------------------------------------------------
-- 4. MATRICULAS BANDA/PROJETO
-- ---------------------------------------------------------
SELECT
  'matriculas_banda',
  COUNT(*) FILTER (WHERE is_projeto_banda = true),
  41,
  CASE WHEN COUNT(*) FILTER (WHERE is_projeto_banda = true) = 41 THEN 'OK' ELSE 'DIVERGENCIA' END
FROM snapshot_base

UNION ALL

-- ---------------------------------------------------------
-- 5. SEGUNDO CURSO OPERACIONAL
--    is_segundo_curso=true AND NAO é banda
-- ---------------------------------------------------------
SELECT
  'matriculas_2_curso',
  COUNT(*) FILTER (WHERE is_segundo_curso = true AND COALESCE(is_projeto_banda, false) = false),
  27,
  CASE WHEN COUNT(*) FILTER (WHERE is_segundo_curso = true AND COALESCE(is_projeto_banda, false) = false) = 27 THEN 'OK' ELSE 'DIVERGENCIA' END
FROM snapshot_base

UNION ALL

-- ---------------------------------------------------------
-- 6. NOVAS MATRICULAS (linhas novas no mês, exclui banda/coral/bolsista)
-- ---------------------------------------------------------
SELECT
  'novas_matriculas',
  COUNT(*),
  23,
  CASE WHEN COUNT(*) = 23 THEN 'OK' ELSE 'DIVERGENCIA' END
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
CROSS JOIN params p
WHERE a.unidade_id = p.unidade_id
  AND COALESCE(a.is_segundo_curso, false) = false
  AND a.data_matricula >= p.inicio_mes
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
  AND COALESCE(c.is_projeto_banda, false) = false
  AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')

UNION ALL

-- ---------------------------------------------------------
-- 7. EVASOES (deduplicadas por nome no mês)
-- ---------------------------------------------------------
SELECT
  'evasoes',
  COUNT(*),
  13,
  CASE WHEN COUNT(*) = 13 THEN 'OK' ELSE 'DIVERGENCIA' END
FROM (
  SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)))
    m.id
  FROM movimentacoes_admin m
  CROSS JOIN params p
  WHERE m.unidade_id = p.unidade_id
    AND m.tipo IN ('evasao', 'nao_renovacao')
    AND m.data >= p.inicio_mes
    AND m.data <= p.fim_mes
  ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.data DESC
) ev

UNION ALL

-- ---------------------------------------------------------
-- 8. CHURN (%)
-- ---------------------------------------------------------
SELECT
  'churn_rate',
  CASE
    WHEN pagantes.val > 0 THEN ROUND((evas.val::numeric / pagantes.val) * 100, 2)
    ELSE 0
  END,
  2.77,
  CASE
    WHEN pagantes.val > 0 AND ROUND((evas.val::numeric / pagantes.val) * 100, 2) = 2.77 THEN 'OK'
    ELSE 'DIVERGENCIA'
  END
FROM
  (SELECT COUNT(DISTINCT nome) FILTER (WHERE conta_como_pagante = true) AS val FROM snapshot_base) pagantes,
  (
    SELECT COUNT(*) AS val FROM (
      SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)))
        m.id
      FROM movimentacoes_admin m
      CROSS JOIN params p
      WHERE m.unidade_id = p.unidade_id
        AND m.tipo IN ('evasao', 'nao_renovacao')
        AND m.data >= p.inicio_mes
        AND m.data <= p.fim_mes
      ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.data DESC
    ) ev
  ) evas

UNION ALL

-- ---------------------------------------------------------
-- 9. TICKET MEDIO (média da soma de parcelas por pessoa)
-- ---------------------------------------------------------
SELECT
  'ticket_medio',
  COALESCE(ROUND(AVG(valor_total), 2), 0),
  386,
  'MANUAL'  -- valor do card pode variar conforme regra de ticket
FROM (
  SELECT nome, SUM(valor_parcela) AS valor_total
  FROM snapshot_base
  WHERE entra_ticket_medio = true
  GROUP BY nome
) t

UNION ALL

-- ---------------------------------------------------------
-- 10. BOLSISTAS INTEGRAIS (pessoas distintas)
-- ---------------------------------------------------------
SELECT
  'bolsistas_integrais',
  COUNT(DISTINCT nome) FILTER (WHERE tipo_matricula_codigo = 'BOLSISTA_INT'),
  NULL,
  'INFO'
FROM snapshot_base

UNION ALL

-- ---------------------------------------------------------
-- 11. BOLSISTAS PARCIAIS (pessoas distintas)
-- ---------------------------------------------------------
SELECT
  'bolsistas_parciais',
  COUNT(DISTINCT nome) FILTER (WHERE tipo_matricula_codigo = 'BOLSISTA_PARC'),
  NULL,
  'INFO'
FROM snapshot_base

ORDER BY kpi;
