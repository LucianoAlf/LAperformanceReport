-- ============================================================
-- AUDITORIA READ-ONLY — Regra de KPIs por Pessoa (não Linha)
-- Campo Grande / Maio 2026
-- Status: NENHUM UPDATE, NENHUMA MIGRATION, NENHUM RPC
-- Objetivo: Validar regra antes de alterar recalcular_dados_mensais
-- ============================================================

-- ----------------------------------------------------------
-- 1. KPIs por PESSOA (nível aluno), não por linha
-- NOTA: Plínio da Silva Bezerra Neto excluído (sujeira — linha 1361
-- ficou ativa indevidamente, contrato está Interrompido no Emusys)
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    a.is_segundo_curso,
    a.valor_parcela,
    tm.nome AS tipo_matricula,
    tm.conta_como_pagante,
    c.nome AS curso_nome,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    -- EXCLUIR Plínio (sujeira: linha 1361 ativa indevidamente)
    AND a.nome != 'Plínio da Silva Bezerra Neto'
),

pessoa AS (
  SELECT 
    nome,
    bool_or(conta_como_pagante = true) AS tem_pagante,
    bool_or(is_projeto_banda = false OR is_projeto_banda IS NULL) AS tem_curso_regular,
    bool_or(is_projeto_banda = true) AS tem_banda,
    bool_and(is_projeto_banda = true) AS so_banda,
    count(*) AS num_linhas
  FROM linhas
  GROUP BY nome
)

SELECT 
  count(*) AS total_pessoas,
  count(*) AS alunos_ativos,
  count(*) FILTER (WHERE tem_pagante) AS alunos_pagantes,
  (SELECT count(*) FROM linhas) AS matriculas_ativas,
  (SELECT count(*) FROM linhas WHERE is_projeto_banda = true) AS matriculas_banda,
  count(*) FILTER (WHERE so_banda) AS pessoas_so_banda,
  count(*) FILTER (WHERE tem_curso_regular AND tem_banda) AS pessoas_regular_e_banda,
  count(*) FILTER (WHERE num_linhas > 1) AS pessoas_multipla_matricula
FROM pessoa;


-- ----------------------------------------------------------
-- 2. Simular recalcular_dados_mensais exatamente como é hoje
-- (read-only, sem INSERT)
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
)

SELECT 
  (SELECT COUNT(*) FROM alunos
   WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
     AND COALESCE(is_segundo_curso, false) = false
     AND data_matricula <= (SELECT dt FROM fim_mes)
     AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
  ) AS funcao_alunos_ativos,

  (SELECT COUNT(*) FROM alunos a
   LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
   WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
     AND COALESCE(a.is_segundo_curso, false) = false
     AND a.data_matricula <= (SELECT dt FROM fim_mes)
     AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
     AND (tm.conta_como_pagante = true OR tm.id IS NULL)
  ) AS funcao_alunos_pagantes,

  (SELECT COUNT(*) FROM alunos
   WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
     AND data_matricula <= (SELECT dt FROM fim_mes)
     AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
  ) AS funcao_matriculas_ativas,

  (SELECT COUNT(*) FROM alunos a
   LEFT JOIN cursos c ON c.id = a.curso_id
   WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
     AND a.data_matricula <= (SELECT dt FROM fim_mes)
     AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
     AND c.is_projeto_banda = true
  ) AS funcao_matriculas_banda,

  (SELECT COUNT(*) FROM alunos
   WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
     AND COALESCE(is_segundo_curso, false) = true
     AND data_matricula <= (SELECT dt FROM fim_mes)
     AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))
  ) AS funcao_matriculas_2_curso;


-- ----------------------------------------------------------
-- 3. Divergência: Função vs View (quem está em uma e não na outra)
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

funcao_snapshot AS (
  SELECT a.id, a.nome, a.status
  FROM alunos a
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND COALESCE(a.is_segundo_curso, false) = false
),

view_snapshot AS (
  SELECT a.id, a.nome, a.status
  FROM alunos a
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.status IN ('ativo', 'trancado')
    AND COALESCE(a.is_segundo_curso, false) = false
)

SELECT 
  'so_na_funcao' AS tipo,
  f.id, f.nome, f.status
FROM funcao_snapshot f
LEFT JOIN view_snapshot v ON v.id = f.id
WHERE v.id IS NULL

UNION ALL

SELECT 
  'so_na_view' AS tipo,
  v.id, v.nome, v.status
FROM view_snapshot v
LEFT JOIN funcao_snapshot f ON f.id = v.id
WHERE f.id IS NULL

ORDER BY tipo, id;


-- ----------------------------------------------------------
-- 4. Casos críticos: Alunos onde TODAS as linhas ativas são is_segundo_curso=true
-- ou onde só existe banda/projeto
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    a.is_segundo_curso,
    a.valor_parcela,
    tm.nome AS tipo_matricula,
    tm.conta_como_pagante,
    c.nome AS curso_nome,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
)

SELECT 
  nome,
  count(*) AS num_linhas,
  bool_or(is_segundo_curso = false OR is_segundo_curso IS NULL) AS tem_linha_principal,
  bool_or(is_projeto_banda = false OR is_projeto_banda IS NULL) AS tem_curso_regular,
  bool_or(conta_como_pagante = true) AS tem_pagante,
  string_agg(
    linha_id::text || '|' || COALESCE(curso_nome,'NULL') || '|' || COALESCE(tipo_matricula,'NULL') || '|R$' || COALESCE(valor_parcela::text,'0') || '|2c=' || COALESCE(is_segundo_curso::text,'NULL') || '|banda=' || COALESCE(is_projeto_banda::text,'NULL'),
    ' ;; ' ORDER BY linha_id
  ) AS detalhes
FROM linhas
GROUP BY nome
HAVING 
  bool_or(is_segundo_curso = false OR is_segundo_curso IS NULL) = false
  OR
  bool_or(is_projeto_banda = false OR is_projeto_banda IS NULL) = false
ORDER BY nome;


-- ----------------------------------------------------------
-- 5. Múltiplas matrículas — detalhe completo por pessoa
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    c.nome AS curso_nome,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda,
    tm.conta_como_pagante,
    a.valor_parcela,
    a.is_segundo_curso
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
)

SELECT 
  nome,
  count(*) AS num_linhas,
  count(*) FILTER (WHERE is_projeto_banda = true) AS linhas_banda,
  count(*) FILTER (WHERE is_projeto_banda = false OR is_projeto_banda IS NULL) AS linhas_regular,
  count(*) FILTER (WHERE conta_como_pagante = true) AS linhas_pagante,
  count(*) FILTER (WHERE is_segundo_curso = true) AS linhas_segundo_curso,
  string_agg(
    linha_id::text || '|' || COALESCE(curso_nome, 'NULL') || '|' ||
    CASE WHEN conta_como_pagante THEN 'PAGANTE' ELSE 'NAO_PAGANTE' END ||
    '|R$' || COALESCE(valor_parcela::text,'0') || '|2c=' || COALESCE(is_segundo_curso::text,'NULL') || '|banda=' || COALESCE(is_projeto_banda::text,'NULL'),
    ' ;; ' ORDER BY linha_id
  ) AS detalhes
FROM linhas
GROUP BY nome
HAVING count(*) > 1
ORDER BY nome;


-- ----------------------------------------------------------
-- 6. Pessoas com SÓ banda/projeto
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    c.nome AS curso_nome,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda,
    a.valor_parcela,
    tm.nome AS tipo_matricula
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
)

SELECT nome, 
  count(*) AS num_linhas,
  string_agg(
    linha_id::text || '|' || COALESCE(curso_nome, 'NULL') || '|R$' || COALESCE(valor_parcela::text,'0'),
    ' ;; ' ORDER BY linha_id
  ) AS detalhes
FROM linhas
GROUP BY nome
HAVING bool_and(is_projeto_banda = true) = true
ORDER BY nome;


-- ----------------------------------------------------------
-- 7. Arthur — verificar estado atual
-- ----------------------------------------------------------
SELECT id, nome, status, data_saida::text, data_matricula::text, 
       tipo_matricula_id, curso_id, is_segundo_curso, valor_parcela::text
FROM alunos
WHERE id = 47 AND unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92';


-- ----------------------------------------------------------
-- 8. Plínio — verificar linhas completas (sujeira confirmada)
-- ----------------------------------------------------------
SELECT id, nome, status, data_saida::text, data_matricula::text,
       is_segundo_curso, curso_id, tipo_matricula_id, valor_parcela::text
FROM alunos
WHERE nome = 'Plínio da Silva Bezerra Neto'
ORDER BY id;


-- ----------------------------------------------------------
-- 8b. Carlos Eduardo — pendência / possível falso pagante
-- ----------------------------------------------------------
SELECT id, nome, curso_id, tipo_matricula_id, valor_parcela::text, 
       is_segundo_curso, status,
       (SELECT conta_como_pagante FROM tipos_matricula WHERE id = a.tipo_matricula_id) AS conta_como_pagante
FROM alunos a
WHERE nome = 'Carlos Eduardo Garcia do Nascimento'
ORDER BY id;


-- ----------------------------------------------------------
-- 1b. KPIs por PESSOA com regra corrigida: pagante = conta_como_pagante=true AND valor_parcela > 0
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    a.is_segundo_curso,
    a.valor_parcela,
    tm.nome AS tipo_matricula,
    tm.conta_como_pagante,
    c.nome AS curso_nome,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
),

pessoa AS (
  SELECT 
    nome,
    bool_or(conta_como_pagante = true AND valor_parcela > 0) AS tem_pagante_real,
    bool_or(is_projeto_banda = false OR is_projeto_banda IS NULL) AS tem_curso_regular,
    bool_or(is_projeto_banda = true) AS tem_banda,
    bool_and(is_projeto_banda = true) AS so_banda,
    count(*) AS num_linhas
  FROM linhas
  GROUP BY nome
)

SELECT 
  count(*) AS total_pessoas,
  count(*) AS alunos_ativos,
  count(*) FILTER (WHERE tem_pagante_real) AS alunos_pagantes_reais,
  (SELECT count(*) FROM linhas) AS matriculas_ativas,
  (SELECT count(*) FROM linhas WHERE is_projeto_banda = true) AS matriculas_banda,
  count(*) FILTER (WHERE so_banda) AS pessoas_so_banda,
  count(*) FILTER (WHERE tem_curso_regular AND tem_banda) AS pessoas_regular_e_banda,
  count(*) FILTER (WHERE num_linhas > 1) AS pessoas_multipla_matricula
FROM pessoa;


-- ----------------------------------------------------------
-- 1c. Ledger nominal: lista de todos os 498 ativos (por PESSOA, não linha)
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    a.status,
    a.valor_parcela,
    a.is_segundo_curso,
    c.nome AS curso_nome,
    tm.nome AS tipo_matricula,
    tm.conta_como_pagante,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
)

SELECT 
  nome,
  count(*) AS num_matriculas,
  bool_or(conta_como_pagante = true) AS tem_pagante_flag,
  bool_or(valor_parcela > 0) AS tem_valor_positivo,
  bool_or(is_projeto_banda = true) AS tem_banda,
  string_agg(
    linha_id::text || '|' || COALESCE(curso_nome,'NULL') || '|' || COALESCE(tipo_matricula,'NULL') || '|R$' || COALESCE(valor_parcela::text,'0') || '|2c=' || COALESCE(is_segundo_curso::text,'NULL') || '|banda=' || COALESCE(is_projeto_banda::text,'NULL'),
    ' ;; ' ORDER BY linha_id
  ) AS detalhes
FROM linhas
GROUP BY nome
ORDER BY nome;


-- ----------------------------------------------------------
-- 1d. Ledger nominal: lista de todos os 474 pagantes provisórios (por PESSOA)
-- NOTA: valor_parcela > 0 é provisório. Requer reconciliação com Emusys/CSV.
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),

linhas AS (
  SELECT 
    a.nome,
    a.id AS linha_id,
    a.status,
    a.valor_parcela,
    a.is_segundo_curso,
    c.nome AS curso_nome,
    tm.nome AS tipo_matricula,
    tm.conta_como_pagante,
    COALESCE(c.is_projeto_banda, false) AS is_projeto_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND a.data_matricula <= (SELECT dt FROM fim_mes)
    AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
    AND a.status IN ('ativo', 'trancado')
    AND a.nome != 'Plínio da Silva Bezerra Neto'
),

pessoa AS (
  SELECT 
    nome,
    bool_or(conta_como_pagante = true AND valor_parcela > 0) AS eh_pagante_provisorio,
    count(*) AS num_matriculas
  FROM linhas
  GROUP BY nome
)

SELECT 
  l.nome,
  p.num_matriculas,
  p.eh_pagante_provisorio,
  string_agg(
    l.linha_id::text || '|' || COALESCE(l.curso_nome,'NULL') || '|' || COALESCE(l.tipo_matricula,'NULL') || '|R$' || COALESCE(l.valor_parcela::text,'0') || '|2c=' || COALESCE(l.is_segundo_curso::text,'NULL') || '|banda=' || COALESCE(l.is_projeto_banda::text,'NULL'),
    ' ;; ' ORDER BY l.linha_id
  ) AS detalhes
FROM linhas l
JOIN pessoa p ON p.nome = l.nome
WHERE p.eh_pagante_provisorio = true
GROUP BY l.nome, p.num_matriculas, p.eh_pagante_provisorio
ORDER BY l.nome;


-- ----------------------------------------------------------
-- 1e. Candidatos que explicam diferença de matrículas (565 vs 563)
-- 4 alunos com status não-ativo no snapshot de maio
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
)

SELECT a.id, a.nome, a.status, a.data_saida::text, a.data_matricula::text,
       a.is_segundo_curso, a.valor_parcela::text,
       c.nome AS curso, tm.nome AS tipo_matricula
FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND a.data_matricula <= (SELECT dt FROM fim_mes)
  AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
  AND a.status NOT IN ('ativo', 'trancado')
ORDER BY a.id;


-- ----------------------------------------------------------
-- 9. dados_mensais vs vw_kpis_gestao_mensal (comparativo)
-- ----------------------------------------------------------
SELECT 
  d.alunos_ativos AS dm_ativos,
  d.alunos_pagantes AS dm_pagantes,
  d.matriculas_banda AS dm_banda,
  d.matriculas_2_curso AS dm_2curso,
  v.total_alunos_ativos AS vw_ativos,
  v.total_alunos_pagantes AS vw_pagantes,
  v.total_banda AS vw_banda,
  v.total_segundo_curso AS vw_2curso
FROM dados_mensais d
LEFT JOIN vw_kpis_gestao_mensal v 
  ON v.unidade_id = d.unidade_id AND v.ano = d.ano AND v.mes = d.mes
WHERE d.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND d.ano = 2026 AND d.mes = 5;


-- ----------------------------------------------------------
-- 10. Alunos com valor_parcela IS NULL OR valor_parcela=0 no snapshot
-- Cruzar com CSV Emusys export_39 para validar pagantes reais
-- ----------------------------------------------------------
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
)

SELECT 
  a.id,
  a.nome,
  a.status,
  a.valor_parcela::text,
  tm.nome AS tipo_matricula,
  tm.conta_como_pagante,
  c.nome AS curso,
  a.is_segundo_curso
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
LEFT JOIN cursos c ON c.id = a.curso_id
WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND a.data_matricula <= (SELECT dt FROM fim_mes)
  AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
  AND a.status IN ('ativo', 'trancado')
  AND a.nome != 'Plínio da Silva Bezerra Neto'
  AND (a.valor_parcela IS NULL OR a.valor_parcela = 0)
ORDER BY a.nome, a.id;


-- ----------------------------------------------------------
-- 11. Bruna Damasceno de Castro — Sujeira pendente (Alf 31/05)
-- Segundo curso Guitarra R$0 incorreto. Aluna faz apenas 1 curso.
-- ----------------------------------------------------------
SELECT 
  a.id,
  a.nome,
  a.status,
  a.valor_parcela::text,
  a.is_segundo_curso,
  c.nome AS curso,
  tm.nome AS tipo_matricula,
  a.data_matricula,
  a.data_saida
FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.nome LIKE '%Bruna Damasceno%'
  AND a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
ORDER BY a.id;
