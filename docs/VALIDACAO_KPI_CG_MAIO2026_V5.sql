-- =============================================================================
-- VALIDACAO_KPI_CG_MAIO2026_V5.sql
-- SELECT-only para validar lógica da MIGRACAO_REGLA_KPI_V5_ALUNOS.sql
-- contra os números esperados de CG/Maio 2026:
--   496 ativos, 470 pagantes, 561 matrículas, 41 banda, 27 segundo curso,
--   23 novas, 13 evasões, 2,77% churn
--
-- Roda direto no SQL Editor do Supabase.
-- =============================================================================

-- Parâmetros da competência fechada
WITH params AS (
  SELECT
    DATE '2026-05-01' AS inicio_mes,
    DATE '2026-05-31' AS fim_mes,
    'CAMPo GRANDE'::text AS unidade_nome_filtro
),

unidade_cg AS (
  SELECT u.id AS unidade_id
  FROM unidades u
  CROSS JOIN params p
  WHERE u.nome ILIKE '%campo grande%'
),

-- Snapshot base de alunos no fim de Maio/2026
snapshot_base AS (
  SELECT
    a.unidade_id,
    a.nome,
    a.status,
    a.data_matricula,
    a.data_saida,
    a.valor_parcela,
    a.is_segundo_curso,
    tm.codigo AS tipo_matricula_codigo,
    tm.conta_como_pagante,
    c.is_projeto_banda,
    c.nome AS curso_nome
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN params p
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
),

-- KPIs alunos/matriculas no snapshot
alunos_kpis AS (
  SELECT
    COUNT(DISTINCT nome) AS alunos_ativos,
    COUNT(DISTINCT nome) FILTER (WHERE conta_como_pagante = true) AS alunos_pagantes,
    COUNT(*) AS matriculas_ativas,
    COUNT(*) FILTER (WHERE is_projeto_banda = true) AS matriculas_banda,
    COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso, false) = true AND COALESCE(is_projeto_banda, false) = false) AS matriculas_2_curso
  FROM snapshot_base sb
  JOIN unidade_cg uc ON uc.unidade_id = sb.unidade_id
),

-- Novas matrículas (snapshot operacional)
novas_kpis AS (
  SELECT COUNT(*) AS novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN params p
  JOIN unidade_cg uc ON uc.unidade_id = a.unidade_id
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula >= p.inicio_mes
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = false
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
),

-- Evasões deduplicadas
evasoes_kpis AS (
  SELECT COUNT(*) AS evasoes
  FROM (
    SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)))
      m.id
    FROM movimentacoes_admin m
    CROSS JOIN params p
    JOIN unidade_cg uc ON uc.unidade_id = m.unidade_id
    WHERE m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data >= p.inicio_mes
      AND m.data < (p.fim_mes + INTERVAL '1 day')
    ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.aluno_id DESC NULLS LAST, m.data DESC
  ) ev
),

-- Churn (depende de pagantes + evasões)
churn_calc AS (
  SELECT
    COALESCE(ak.alunos_pagantes, 0) AS pagantes,
    COALESCE(ek.evasoes, 0) AS evasoes,
    CASE WHEN COALESCE(ak.alunos_pagantes, 0) > 0
         THEN ROUND(COALESCE(ek.evasoes, 0)::numeric / ak.alunos_pagantes::numeric * 100, 2)
         ELSE 0 END AS churn_rate
  FROM alunos_kpis ak, evasoes_kpis ek
)

-- =============================================================================
-- RESULTADO ESPERADO CG/MAIO 2026
-- =============================================================================
SELECT
  'CG Maio 2026' AS cenario,
  ak.alunos_ativos AS ativos,
  ak.alunos_pagantes AS pagantes,
  ak.matriculas_ativas AS matriculas,
  ak.matriculas_banda AS banda,
  ak.matriculas_2_curso AS segundo_curso,
  COALESCE(nk.novas_matriculas, 0) AS novas,
  COALESCE(ek.evasoes, 0) AS evasoes,
  cc.churn_rate AS churn_pct,
  CASE
    WHEN ak.alunos_ativos = 496 THEN '✅ ativos'
    ELSE '❌ ativos: esperado 496, obtido ' || ak.alunos_ativos::text
  END AS check_ativos,
  CASE
    WHEN ak.alunos_pagantes = 470 THEN '✅ pagantes'
    ELSE '❌ pagantes: esperado 470, obtido ' || ak.alunos_pagantes::text
  END AS check_pagantes,
  CASE
    WHEN ak.matriculas_ativas = 561 THEN '✅ matrículas'
    ELSE '❌ matrículas: esperado 561, obtido ' || ak.matriculas_ativas::text
  END AS check_matriculas,
  CASE
    WHEN ak.matriculas_banda = 41 THEN '✅ banda'
    ELSE '❌ banda: esperado 41, obtido ' || ak.matriculas_banda::text
  END AS check_banda,
  CASE
    WHEN ak.matriculas_2_curso = 27 THEN '✅ segundo curso'
    ELSE '❌ segundo curso: esperado 27, obtido ' || ak.matriculas_2_curso::text
  END AS check_segundo_curso,
  CASE
    WHEN COALESCE(nk.novas_matriculas, 0) = 23 THEN '✅ novas'
    ELSE '❌ novas: esperado 23, obtido ' || COALESCE(nk.novas_matriculas, 0)::text
  END AS check_novas,
  CASE
    WHEN COALESCE(ek.evasoes, 0) = 13 THEN '✅ evasões'
    ELSE '❌ evasões: esperado 13, obtido ' || COALESCE(ek.evasoes, 0)::text
  END AS check_evasoes,
  CASE
    WHEN cc.churn_rate = 2.77 THEN '✅ churn'
    ELSE '❌ churn: esperado 2.77%, obtido ' || cc.churn_rate::text || '%'
  END AS check_churn
FROM alunos_kpis ak, novas_kpis nk, evasoes_kpis ek, churn_calc cc;


-- =============================================================================
-- DETALHAMENTO: alunos com múltiplas linhas (para auditoria nominal)
-- =============================================================================
-- SELECT
--   sb.nome,
--   COUNT(*) AS linhas,
--   COUNT(*) FILTER (WHERE sb.conta_como_pagante = true) AS linhas_pagantes,
--   COUNT(*) FILTER (WHERE sb.is_projeto_banda = true) AS linhas_banda,
--   COUNT(*) FILTER (WHERE COALESCE(sb.is_segundo_curso, false) = true) AS linhas_segundo_curso,
--   SUM(sb.valor_parcela) AS soma_parcelas,
--   MIN(sb.status) AS status,
--   string_agg(DISTINCT sb.tipo_matricula_codigo, ', ') AS tipos
-- FROM snapshot_base sb
-- JOIN unidade_cg uc ON uc.unidade_id = sb.unidade_id
-- GROUP BY sb.nome
-- HAVING COUNT(*) > 1
-- ORDER BY COUNT(*) DESC;
