-- =============================================================================
-- CREATE_VIEW_AUDITORIA_SOL_V3.sql
-- DDL: Cria view vw_auditoria_inconsistencias_v3
--
-- ATENCAO: Esta view audita o ESTADO ATUAL (mes corrente, snapshot vivo).
-- Para auditoria de competencia fechada (ex: Maio/2026), usar
-- QUERIES_AUDITORIA_SOL_READONLY_V3.sql com CTE de competencia fixa
-- ou adaptar esta view para funcao parametrizada.
-- =============================================================================

CREATE OR REPLACE VIEW vw_auditoria_inconsistencias_v3 AS
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
),

snapshot_atual AS (
  SELECT
    a.id,
    a.nome,
    a.status,
    a.unidade_id,
    a.data_matricula,
    a.data_saida,
    a.valor_parcela,
    a.is_segundo_curso,
    a.tipo_matricula_id,
    a.curso_id,
    a.professor_atual_id,
    a.status_pagamento,
    tm.codigo AS tipo_matricula_codigo,
    tm.conta_como_pagante,
    tm.nome AS tipo_matricula_nome,
    c.nome AS curso_nome,
    c.is_projeto_banda,
    u.nome AS unidade_nome,
    LOWER(REGEXP_REPLACE(TRIM(BOTH FROM a.nome), '[^a-z0-9]', '', 'g')) AS chave_nome
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN unidades u ON u.id = a.unidade_id
  CROSS JOIN params p
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
)

-- ---------------------------------------------------------
-- A1_CRITICO: Pagante com valor_parcela IS NULL ou = 0
-- ---------------------------------------------------------
SELECT
  sa.id AS aluno_id,
  sa.nome,
  sa.unidade_nome,
  'A1_CRITICO_PAGANTE_ZERADO' AS tipo_inconsistencia,
  'conta_como_pagante=true mas valor_parcela NULL/0. Verificar fatura movida, passaporte, novo ou sujeira.' AS descricao,
  jsonb_build_object(
    'valor_parcela', sa.valor_parcela,
    'tipo_matricula', sa.tipo_matricula_nome,
    'status', sa.status,
    'curso', sa.curso_nome,
    'is_segundo_curso', sa.is_segundo_curso,
    'is_projeto_banda', sa.is_projeto_banda
  ) AS meta
FROM snapshot_atual sa
WHERE sa.conta_como_pagante = true
  AND (sa.valor_parcela IS NULL OR sa.valor_parcela = 0)

UNION ALL

-- ---------------------------------------------------------
-- A1_INFO: Nao-pagante (bolsista/banda/permuta) com valor=0
-- Nao e sujeira por si so, mas merece atencao
-- ---------------------------------------------------------
SELECT
  sa.id,
  sa.nome,
  sa.unidade_nome,
  'A1_INFO_VALOR_ZERADO',
  'Nao-pagante/bolsista/banda/permuta com valor_parcela=0. Informativo — pode ser legitimo.',
  jsonb_build_object(
    'valor_parcela', sa.valor_parcela,
    'tipo_matricula', sa.tipo_matricula_nome,
    'curso', sa.curso_nome,
    'conta_como_pagante', sa.conta_como_pagante
  )
FROM snapshot_atual sa
WHERE (sa.valor_parcela IS NULL OR sa.valor_parcela = 0)
  AND (sa.conta_como_pagante = false OR sa.tipo_matricula_codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'PROFESSOR', 'ESTAGIARIO', 'PERMUTA', 'NAO_PAGANTE'))

UNION ALL

-- ---------------------------------------------------------
-- A2: Bolsista/Professor/Estagiario/Permuta marcado como pagante
-- ---------------------------------------------------------
SELECT
  sa.id,
  sa.nome,
  sa.unidade_nome,
  'A2_TIPO_NAO_PAGANTE_COMO_PAGANTE',
  'Tipo de matricula ' || sa.tipo_matricula_codigo || ' nao deveria contar como pagante.',
  jsonb_build_object(
    'tipo_matricula_codigo', sa.tipo_matricula_codigo,
    'conta_como_pagante', sa.conta_como_pagante,
    'curso', sa.curso_nome
  )
FROM snapshot_atual sa
WHERE sa.conta_como_pagante = true
  AND sa.tipo_matricula_codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'PROFESSOR', 'ESTAGIARIO', 'PERMUTA', 'NAO_PAGANTE')

UNION ALL

-- ---------------------------------------------------------
-- A3: Duplicidade por nome (lógica corrigida)
--
-- Severidade:
--   CRITICO_PRINCIPAL: >= 2 linhas principais (nao-banda, nao-segundo-curso)
--     → provavel cadastro duplicado real
--   CRITICO_CURSO_REPETIDO: mesmo curso_nome aparece > 1 vez
--     → sujeira de cadastro
--   INFO: cursos distintos, sem repeticao
--     → provavel segundo curso ou banda legitima
--
-- NOTA: Um aluno pode aparecer em multiplos alertas (A1 + A2, A3 + A4, etc).
-- Isso e aceitavel — cada alerta tem severidade propria.
-- ---------------------------------------------------------
SELECT
  sa.id,
  sa.nome,
  sa.unidade_nome,
  CASE
    WHEN da.linhas_principais >= 2 THEN 'A3_CRITICO_DUPLICIDADE_PRINCIPAL'
    WHEN da.max_curso_repetido > 1 THEN 'A3_CRITICO_DUPLICIDADE_CURSO_REPETIDO'
    ELSE 'A3_INFO_POSSIVEL_DUPLICIDADE'
  END AS tipo_inconsistencia,
  CASE
    WHEN da.linhas_principais >= 2 THEN 'Duas (ou mais) linhas principais (nao-banda, nao-segundo-curso) para o mesmo nome. Provavel sujeira de cadastro.'
    WHEN da.max_curso_repetido > 1 THEN 'Mesmo curso repetido para o mesmo nome. Provavel sujeira de cadastro.'
    ELSE 'Nome duplicado com cursos distintos (curso+banda ou segundo curso). Revisar se e legitimo.'
  END AS descricao,
  jsonb_build_object(
    'chave_nome', sa.chave_nome,
    'ocorrencias', da.total_linhas,
    'ids_similares', da.ids_similares,
    'cursos', da.cursos_similares,
    'is_segundo_curso', sa.is_segundo_curso,
    'is_projeto_banda', sa.is_projeto_banda
  )
FROM snapshot_atual sa
JOIN (
  SELECT
    chave_nome,
    unidade_id,
    COUNT(*) AS total_linhas,
    string_agg(id::text, ', ' ORDER BY id) AS ids_similares,
    string_agg(DISTINCT curso_nome, ', ' ORDER BY curso_nome) AS cursos_similares,
    COUNT(*) FILTER (WHERE COALESCE(is_segundo_curso, false) = false AND COALESCE(is_projeto_banda, false) = false) AS linhas_principais,
    MAX(curso_repeticoes) AS max_curso_repetido
  FROM (
    SELECT
      chave_nome, unidade_id, id, curso_nome,
      is_segundo_curso, is_projeto_banda,
      COUNT(*) OVER (PARTITION BY chave_nome, unidade_id, curso_nome) AS curso_repeticoes
    FROM snapshot_atual
  ) sub
  GROUP BY chave_nome, unidade_id
  HAVING COUNT(*) > 1
) da ON da.chave_nome = sa.chave_nome AND da.unidade_id = sa.unidade_id

UNION ALL

-- ---------------------------------------------------------
-- A4: Segundo curso operacional com valor_parcela = 0
-- Exclui banda/projeto (is_projeto_banda=false)
-- ---------------------------------------------------------
SELECT
  sa.id,
  sa.nome,
  sa.unidade_nome,
  'A4_SEGUNDO_CURSO_ZERADO',
  'Segundo curso operacional (nao-banda) com valor_parcela=0. Pode indicar sujeira de cadastro.',
  jsonb_build_object(
    'valor_parcela', sa.valor_parcela,
    'curso', sa.curso_nome,
    'is_segundo_curso', sa.is_segundo_curso,
    'is_projeto_banda', sa.is_projeto_banda
  )
FROM snapshot_atual sa
WHERE sa.is_segundo_curso = true
  AND COALESCE(sa.is_projeto_banda, false) = false
  AND (sa.valor_parcela IS NULL OR sa.valor_parcela = 0)

UNION ALL

-- ---------------------------------------------------------
-- A5: Inativo/Evadido/Cancelado sem data_saida
-- ---------------------------------------------------------
SELECT
  a.id,
  a.nome,
  u.nome AS unidade_nome,
  'A5_INATIVO_SEM_DATA_SAIDA',
  'Status ' || a.status || ' sem data_saida preenchida. Impacta snapshot e KPIs.',
  jsonb_build_object(
    'status', a.status,
    'data_matricula', a.data_matricula,
    'data_saida', a.data_saida
  )
FROM alunos a
LEFT JOIN unidades u ON u.id = a.unidade_id
WHERE a.status IN ('inativo', 'evadido', 'cancelado')
  AND a.data_saida IS NULL;
