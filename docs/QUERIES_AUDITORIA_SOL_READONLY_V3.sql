-- =============================================================================
-- QUERIES_AUDITORIA_SOL_READONLY_V3.sql
-- Queries SELECT-only para auditoria de inconsistencias.
-- Roda direto no SQL Editor do Supabase (sem \echo, sem DDL).
--
-- ATENCAO: Usa CURRENT_DATE — audita o MES ATUAL (snapshot vivo).
-- Para competencia fechada (ex: Maio/2026), trocar params para:
--   DATE '2026-05-01' AS inicio_mes,
--   DATE '2026-05-31' AS fim_mes
-- =============================================================================

-- ---------------------------------------------------------
-- Q1: Tipos nao-pagantes marcados como pagantes no snapshot
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  tm.codigo AS tipo_matricula,
  tm.conta_como_pagante,
  c.nome AS curso,
  a.is_segundo_curso,
  c.is_projeto_banda,
  a.valor_parcela
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN unidades u ON u.id = a.unidade_id
CROSS JOIN params p
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND tm.conta_como_pagante = true
  AND tm.codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'PROFESSOR', 'ESTAGIARIO', 'PERMUTA', 'NAO_PAGANTE')
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q2a: CRITICO — Pagantes com valor_parcela NULL ou 0
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.valor_parcela,
  tm.nome AS tipo_matricula,
  tm.conta_como_pagante,
  c.nome AS curso,
  a.is_segundo_curso,
  c.is_projeto_banda,
  a.data_matricula,
  a.status_pagamento
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN unidades u ON u.id = a.unidade_id
CROSS JOIN params p
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND tm.conta_como_pagante = true
  AND (a.valor_parcela IS NULL OR a.valor_parcela = 0)
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q2b: INFO — Nao-pagantes/bolsista/banda/permuta com valor=0
-- (Informativo, pode ser legitimo)
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.valor_parcela,
  tm.nome AS tipo_matricula,
  tm.conta_como_pagante,
  c.nome AS curso,
  a.is_segundo_curso,
  c.is_projeto_banda,
  a.data_matricula,
  a.status_pagamento
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN unidades u ON u.id = a.unidade_id
CROSS JOIN params p
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND (a.valor_parcela IS NULL OR a.valor_parcela = 0)
  AND (tm.conta_como_pagante = false OR tm.codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'PROFESSOR', 'ESTAGIARIO', 'PERMUTA', 'NAO_PAGANTE'))
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q3: Duplicados por nome — classificacao completa
--
-- Severidade:
--   CRITICO_PRINCIPAL: >= 2 linhas principais (nao-banda, nao-segundo-curso)
--   CRITICO_CURSO_REPETIDO: mesmo curso_id aparece > 1 vez
--   INFO_BANDA: curso + banda/projeto legitimo
--   INFO_SEGUNDO_CURSO: curso + segundo curso legitimo
--   ALERTA_CADASTRO: curso_id NULL
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
),
snapshot AS (
  SELECT
    a.id,
    a.nome,
    a.unidade_id,
    a.curso_id,
    a.is_segundo_curso,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda,
    c.nome AS curso_nome,
    LOWER(REGEXP_REPLACE(TRIM(BOTH FROM a.nome), '[^a-z0-9]', '', 'g')) AS chave
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= (SELECT fim_mes FROM params)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT fim_mes FROM params))
),
duplicados AS (
  SELECT
    chave,
    unidade_id,
    COUNT(*) AS qtd,
    COUNT(*) FILTER (
      WHERE COALESCE(is_segundo_curso, false) = false
        AND COALESCE(is_projeto_banda, false) = false
    ) AS linhas_principais,
    COUNT(DISTINCT curso_id) AS cursos_distintos,
    MAX(curso_repet) AS max_curso_repetido,
    bool_or(curso_id IS NULL) AS tem_curso_null,
    bool_or(is_projeto_banda = true) AS tem_banda,
    bool_or(COALESCE(is_segundo_curso, false) = true) AS tem_segundo_curso,
    string_agg(id::text, ', ' ORDER BY id) AS ids,
    string_agg(DISTINCT curso_nome, ', ' ORDER BY curso_nome) AS cursos_nomes
  FROM (
    SELECT *,
      COUNT(*) OVER (PARTITION BY chave, unidade_id, curso_id) AS curso_repet
    FROM snapshot
  ) sub
  GROUP BY chave, unidade_id
  HAVING COUNT(*) > 1
)
SELECT
  d.chave,
  u.nome AS unidade,
  d.qtd,
  d.ids,
  d.cursos_nomes,
  CASE
    WHEN d.tem_curso_null THEN 'ALERTA_CADASTRO: curso_id NULL (cadastro incompleto)'
    WHEN d.linhas_principais >= 2 THEN 'CRITICO_PRINCIPAL: duas linhas principais (nao-banda, nao-segundo-curso). Sujeira provavel.'
    WHEN d.max_curso_repetido > 1 THEN 'CRITICO_CURSO_REPETIDO: mesmo curso repetido. Sujeira de cadastro.'
    WHEN d.qtd = 2 AND d.linhas_principais = 1 AND d.tem_banda THEN 'INFO_BANDA: curso principal + banda/projeto. Revisar se legitimo.'
    WHEN d.qtd = 2 AND d.linhas_principais = 1 AND d.tem_segundo_curso THEN 'INFO_SEGUNDO_CURSO: curso principal + segundo curso. Revisar se legitimo.'
    ELSE 'INFO: cursos distintos. Revisar se legitimo.'
  END AS severidade
FROM duplicados d
LEFT JOIN unidades u ON u.id = d.unidade_id
ORDER BY d.qtd DESC, u.nome;

-- ---------------------------------------------------------
-- Q4: Segundo curso operacional (nao-banda) com valor_parcela = 0
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.valor_parcela,
  a.is_segundo_curso,
  c.nome AS curso,
  c.is_projeto_banda,
  tm.nome AS tipo_matricula,
  a.data_matricula
FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN unidades u ON u.id = a.unidade_id
CROSS JOIN params p
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND a.is_segundo_curso = true
  AND COALESCE(c.is_projeto_banda, false) = false
  AND (a.valor_parcela IS NULL OR a.valor_parcela = 0)
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q5: Inativos/evadidos/cancelados sem data_saida
-- ---------------------------------------------------------
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.status,
  a.data_matricula,
  a.data_saida,
  a.valor_parcela
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
WHERE a.status IN ('inativo', 'evadido', 'cancelado')
  AND a.data_saida IS NULL
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q6: Ativos sem registro de presenca (EXPERIMENTAL/INFORMATIVO)
-- Nao tratar como sujeira critica — tabela pode nao estar 100% integrada.
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.data_matricula,
  a.status,
  'INFO_EXPERIMENTAL' AS tipo_alerta,
  'Aluno ativo sem registro em aluno_presenca. Pode ser normal se a integracao de frequencia nao estiver completa.' AS observacao
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
LEFT JOIN aluno_presenca ap ON ap.aluno_id = a.id
CROSS JOIN params p
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND ap.id IS NULL
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q7: Curso divergente (aluno em curso inexistente ou desativado)
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.curso_id,
  c.nome AS curso_nome,
  c.ativo AS curso_ativo
FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN unidades u ON u.id = a.unidade_id
CROSS JOIN params p
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
  AND (c.id IS NULL OR c.ativo = false)
ORDER BY u.nome, a.nome;

-- ---------------------------------------------------------
-- Q8: Professor atribuido a aluno que nao existe na tabela professores
-- ---------------------------------------------------------
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
)
SELECT
  a.id,
  a.nome,
  u.nome AS unidade,
  a.professor_atual_id,
  p.nome AS professor_nome
FROM alunos a
LEFT JOIN professores p ON p.id = a.professor_atual_id
LEFT JOIN unidades u ON u.id = a.unidade_id
CROSS JOIN params p_params
WHERE a.status IN ('ativo', 'trancado')
  AND a.data_matricula <= p_params.fim_mes
  AND (a.data_saida IS NULL OR a.data_saida > p_params.fim_mes)
  AND a.professor_atual_id IS NOT NULL
  AND p.id IS NULL
ORDER BY u.nome, a.nome;
