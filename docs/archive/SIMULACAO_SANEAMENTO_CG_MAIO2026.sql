-- ============================================================
-- SIMULAÇÃO READ-ONLY — Campo Grande / Maio 2026
-- SEM DDL. SEM ALTERAÇÃO DE SCHEMA. APENAS SELECT + CTE.
-- ============================================================
-- Geração: 31/05/2026
-- Autor: Windsurf (revisado por Alf)
--
-- INSTRUÇÕES:
-- 1. Rodar este arquivo inteiro no Supabase SQL Editor
-- 2. Validar resultados com Alf
-- 3. Só depois executar o SQL de UPDATE (arquivo separado)
-- ============================================================

-- ============================================================
-- SEÇÃO 1: PREVIEW DOS 28 ALUNOS (antes/after detalhado)
-- ============================================================

WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

-- 28 correções validadas pelo Alf
correcoes(id, nova_data_saida, novo_status, grupo, descricao) AS (
  -- GRUPO A (16): preencher data_saida real
  SELECT 106,  '2026-03-05'::date, NULL,         'A', 'Emily'
  UNION ALL SELECT 85,  '2026-04-25', NULL,         'A', 'Davi Borges'
  UNION ALL SELECT 94,  '2026-04-01', NULL,         'A', 'Davi Rosendo'
  UNION ALL SELECT 131, '2026-03-03', NULL,         'A', 'Gabriel'
  UNION ALL SELECT 137, '2026-05-07', NULL,         'A', 'Georgie'
  UNION ALL SELECT 149, '2026-05-04', NULL,         'A', 'Guilherme'
  UNION ALL SELECT 165, '2026-04-11', NULL,         'A', 'Heitor'
  UNION ALL SELECT 224, '2026-04-02', NULL,         'A', 'Laura'
  UNION ALL SELECT 258, '2026-05-06', NULL,         'A', 'Luís Rafael'
  UNION ALL SELECT 270, '2026-04-02', NULL,         'A', 'Manuela'
  UNION ALL SELECT 327, '2026-03-06', NULL,         'A', 'Murilo'
  UNION ALL SELECT 354, '2026-03-06', NULL,         'A', 'Pedro'
  UNION ALL SELECT 384, '2026-04-10', NULL,         'A', 'Sophia'
  UNION ALL SELECT 11,  '2026-03-14', NULL,         'A', 'Alexandre Wallace'
  UNION ALL SELECT 118, '2026-03-23', NULL,         'A', 'Felipe'
  UNION ALL SELECT 1377,'2026-04-01', NULL,         'A', 'Alexandre Serra'

  -- GRUPO B (1): status='inativo', NÃO limpar data_saida
  UNION ALL SELECT 47,  NULL, 'inativo', 'B', 'Arthur'

  -- GRUPO C (5): limpar data_saida (ativos confirmados pelo Alf)
  UNION ALL SELECT 31,  NULL, NULL, 'C', 'Anne'
  UNION ALL SELECT 263, NULL, NULL, 'C', 'Luiza'
  UNION ALL SELECT 405, NULL, NULL, 'C', 'Vicente'
  UNION ALL SELECT 323, NULL, NULL, 'C', 'Miguel'
  UNION ALL SELECT 949, NULL, NULL, 'C', 'Cassyo'

  -- GRUPO D (2): não matriculados → corte técnico
  UNION ALL SELECT 1450,'2026-05-31', NULL, 'D', 'Maria Eduarda (não matriculada)'
  UNION ALL SELECT 1378,'2026-05-31', NULL, 'D', 'Ana Julia (não matriculada)'

  -- GRUPO E (2): excluídos/não matriculados → corte técnico
  UNION ALL SELECT 945, '2026-05-31', NULL, 'E', 'Luciano'
  UNION ALL SELECT 1598,'2026-05-31', NULL, 'E', 'Alexandre Dos Santos'

  -- GRUPO F (2): só banda → mantêm data_saida, excluídos de ativos/pagantes pela regra banda
  UNION ALL SELECT 1375, NULL, NULL, 'F', 'Alan Samico (só banda)'
  UNION ALL SELECT 1393, NULL, NULL, 'F', 'Leamsi (só banda)'
),

alunos_preview AS (
  SELECT
    c.grupo,
    a.id,
    a.nome,
    a.status                       AS status_atual,
    COALESCE(c.novo_status, a.status) AS status_virt,
    a.data_saida::text             AS data_saida_atual,
    CASE
      WHEN c.grupo = 'B' THEN a.data_saida::text  -- manter
      WHEN c.nova_data_saida IS NOT NULL THEN c.nova_data_saida::text
      WHEN c.id IS NOT NULL THEN 'NULL'
      ELSE a.data_saida::text
    END                            AS data_saida_virt,
    c.descricao                    AS acao,
    -- no snapshot de maio?
    CASE WHEN a.data_matricula <= (SELECT dt FROM fim_mes)
          AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
         THEN 'SIM' ELSE 'NÃO' END AS no_snapshot_atual,
    CASE WHEN a.data_matricula <= (SELECT dt FROM fim_mes)
          AND (c.nova_data_saida IS NULL OR c.nova_data_saida > (SELECT dt FROM fim_mes))
          AND (c.id IS NULL OR c.nova_data_saida IS NOT NULL)
         THEN 'SIM'
         WHEN c.id IS NOT NULL AND c.nova_data_saida IS NULL AND a.data_matricula <= (SELECT dt FROM fim_mes)
         THEN 'SIM'  -- Grupo C: limpar data_saida → entra
         ELSE 'NÃO'
    END AS no_snapshot_virt
  FROM correcoes c
  JOIN alunos a ON a.id = c.id
)

SELECT * FROM alunos_preview
ORDER BY grupo, id;


-- ============================================================
-- SEÇÃO 2: SIMULAÇÃO AGREGADA — 3 CENÁRIOS
-- ============================================================
-- Rode esta seção separadamente (ou comentar a seção 1)

WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

correcoes(id, nova_data_saida, novo_status) AS (
  SELECT 106,  '2026-03-05'::date, NULL UNION ALL
  SELECT 85,  '2026-04-25', NULL UNION ALL
  SELECT 94,  '2026-04-01', NULL UNION ALL
  SELECT 131, '2026-03-03', NULL UNION ALL
  SELECT 137, '2026-05-07', NULL UNION ALL
  SELECT 149, '2026-05-04', NULL UNION ALL
  SELECT 165, '2026-04-11', NULL UNION ALL
  SELECT 224, '2026-04-02', NULL UNION ALL
  SELECT 258, '2026-05-06', NULL UNION ALL
  SELECT 270, '2026-04-02', NULL UNION ALL
  SELECT 327, '2026-03-06', NULL UNION ALL
  SELECT 354, '2026-03-06', NULL UNION ALL
  SELECT 384, '2026-04-10', NULL UNION ALL
  SELECT 11,  '2026-03-14', NULL UNION ALL
  SELECT 118, '2026-03-23', NULL UNION ALL
  SELECT 1377,'2026-04-01', NULL UNION ALL
  SELECT 47,  NULL, 'inativo' UNION ALL
  SELECT 31,  NULL, NULL UNION ALL
  SELECT 263, NULL, NULL UNION ALL
  SELECT 405, NULL, NULL UNION ALL
  SELECT 323, NULL, NULL UNION ALL
  SELECT 949, NULL, NULL UNION ALL
  SELECT 1450,'2026-05-31', NULL UNION ALL
  SELECT 1378,'2026-05-31', NULL UNION ALL
  SELECT 945, '2026-05-31', NULL UNION ALL
  SELECT 1598,'2026-05-31', NULL
),

alunos_virt AS (
  SELECT a.*,
    CASE
      WHEN c.id IS NOT NULL AND c.nova_data_saida IS NOT NULL THEN c.nova_data_saida
      WHEN c.id IS NOT NULL AND c.nova_data_saida IS NULL THEN NULL
      ELSE a.data_saida
    END AS data_saida_virt
  FROM alunos a
  LEFT JOIN correcoes c ON c.id = a.id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
),

with_cursos AS (
  SELECT av.*, c.is_projeto_banda
  FROM alunos_virt av
  LEFT JOIN cursos c ON c.id = av.curso_id
),

evasoes AS (
  SELECT COUNT(*) AS val
  FROM movimentacoes_admin
  WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND tipo IN ('evasao', 'nao_renovacao')
    AND EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 5
)

SELECT
  'ANTES (snapshot atual sujo)' AS cenario,
  COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
    AND data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
  ) AS alunos_ativos,
  COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
    AND data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
    AND (EXISTS(SELECT 1 FROM tipos_matricula tm WHERE tm.id=tipo_matricula_id AND tm.conta_como_pagante=true) OR tipo_matricula_id IS NULL)
  ) AS alunos_pagantes,
  COUNT(*) FILTER (WHERE data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
  ) AS matriculas_ativas,
  COUNT(*) FILTER (WHERE data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
    AND is_projeto_banda = true
  ) AS matriculas_banda,
  ROUND(((SELECT val FROM evasoes)::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
      AND data_matricula <= (SELECT dt FROM fim_mes)
      AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
      AND curso_id IS NOT NULL
      AND (EXISTS(SELECT 1 FROM tipos_matricula tm WHERE tm.id=tipo_matricula_id AND tm.conta_como_pagante=true) OR tipo_matricula_id IS NULL)
    ), 0)) * 100, 2
  ) AS churn_rate
FROM alunos
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'

UNION ALL

SELECT
  'DEPOIS A: correções aplicadas (regra v2)' AS cenario,
  COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
    AND data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
  ) AS alunos_ativos,
  COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
    AND data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
    AND (EXISTS(SELECT 1 FROM tipos_matricula tm WHERE tm.id=tipo_matricula_id AND tm.conta_como_pagante=true) OR tipo_matricula_id IS NULL)
  ) AS alunos_pagantes,
  COUNT(*) FILTER (WHERE data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
  ) AS matriculas_ativas,
  COUNT(*) FILTER (WHERE data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND is_projeto_banda = true
  ) AS matriculas_banda,
  ROUND(((SELECT val FROM evasoes)::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
      AND data_matricula <= (SELECT dt FROM fim_mes)
      AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
      AND curso_id IS NOT NULL
      AND (EXISTS(SELECT 1 FROM tipos_matricula tm WHERE tm.id=tipo_matricula_id AND tm.conta_como_pagante=true) OR tipo_matricula_id IS NULL)
    ), 0)) * 100, 2
  ) AS churn_rate
FROM with_cursos

UNION ALL

SELECT
  'DEPOIS B: correções + excluir banda de ativos/pagantes' AS cenario,
  COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
    AND data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
    AND COALESCE(is_projeto_banda, false) = false
  ) AS alunos_ativos,
  COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
    AND data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
    AND (EXISTS(SELECT 1 FROM tipos_matricula tm WHERE tm.id=tipo_matricula_id AND tm.conta_como_pagante=true) OR tipo_matricula_id IS NULL)
    AND COALESCE(is_projeto_banda, false) = false
  ) AS alunos_pagantes,
  COUNT(*) FILTER (WHERE data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND curso_id IS NOT NULL
  ) AS matriculas_ativas,
  COUNT(*) FILTER (WHERE data_matricula <= (SELECT dt FROM fim_mes)
    AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
    AND is_projeto_banda = true
  ) AS matriculas_banda,
  ROUND(((SELECT val FROM evasoes)::NUMERIC /
    NULLIF(COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso,false)=false
      AND data_matricula <= (SELECT dt FROM fim_mes)
      AND (data_saida_virt IS NULL OR data_saida_virt > (SELECT dt FROM fim_mes))
      AND curso_id IS NOT NULL
      AND (EXISTS(SELECT 1 FROM tipos_matricula tm WHERE tm.id=tipo_matricula_id AND tm.conta_como_pagante=true) OR tipo_matricula_id IS NULL)
      AND COALESCE(is_projeto_banda, false) = false
    ), 0)) * 100, 2
  ) AS churn_rate
FROM with_cursos;
