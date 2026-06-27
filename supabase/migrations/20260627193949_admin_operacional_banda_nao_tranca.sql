-- ============================================================================
-- P08A-fix2 - Banda/projeto nao usa trancamento como carteira ativa
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Regra de negocio LA Report:
-- - Aluno regular trancado continua na carteira operacional e pode contar como
--   ativo/pagante conforme a matricula regular.
-- - Matricula em banda/projeto nao tem estado operacional "trancado".
--   Se saiu da banda, nao entra na contagem de matriculas em banda.
-- - Bolsista integral/parcial nao gera MRR/pagante, mesmo se algum dado legado
--   estiver com tipo_matricula_id regular.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_admin_operacional(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH params AS (
  SELECT
    make_date(p_ano, p_mes, 1)::date AS inicio_mes,
    LEAST(
      (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
    ) AS data_corte
),
unidades_base AS (
  SELECT u.id AS unidade_id, u.nome AS unidade_nome
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
alunos_base AS (
  SELECT
    a.id,
    a.unidade_id,
    a.nome,
    a.status,
    a.tipo_aluno,
    a.data_matricula,
    a.data_saida,
    COALESCE(a.valor_parcela, 0)::numeric AS valor_parcela,
    COALESCE(a.is_segundo_curso, false) AS is_segundo_curso,
    CASE
      WHEN btrim(COALESCE(a.nome, '')) <> ''
        THEN lower(btrim(a.nome)) || '|' || a.unidade_id::text
      ELSE a.id::text || '|' || a.unidade_id::text
    END AS pessoa_key,
    COALESCE(c.is_projeto_banda, false) AS curso_banda,
    lower(COALESCE(c.nome, '')) LIKE '%coral%' AS is_coral,
    COALESCE(tm.codigo, '') AS tipo_codigo,
    COALESCE(tm.conta_como_pagante, false) AS conta_como_pagante,
    COALESCE(tm.entra_ticket_medio, false) AS entra_ticket_medio
  FROM public.alunos a
  JOIN unidades_base ub ON ub.unidade_id = a.unidade_id
  LEFT JOIN public.cursos c ON c.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.arquivado_em IS NULL
),
alunos_classificados AS (
  SELECT
    ab.*,
    (ab.curso_banda = true OR ab.tipo_codigo = 'BANDA') AS is_banda_operacional,
    ab.is_segundo_curso = true AS is_segundo_operacional,
    (
      ab.status = 'ativo'
      OR (
        ab.status = 'trancado'
        AND (ab.curso_banda = false AND ab.tipo_codigo <> 'BANDA')
        AND ab.is_coral = false
      )
    ) AS entra_carteira_operacional
  FROM alunos_base ab
),
pessoas_ativas AS (
  SELECT
    ac.unidade_id,
    ac.pessoa_key,
    SUM(
      CASE
        WHEN ac.entra_ticket_medio = true
          AND ac.valor_parcela > 0
          AND ac.tipo_codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
          AND COALESCE(ac.tipo_aluno, '') NOT IN ('bolsista_integral', 'bolsista_parcial')
        THEN ac.valor_parcela
        ELSE 0
      END
    ) AS mrr,
    BOOL_OR(
      (ac.tipo_codigo = 'BOLSISTA_INT' OR ac.tipo_aluno = 'bolsista_integral')
      AND ac.is_banda_operacional = false
      AND ac.is_segundo_operacional = false
    ) AS bolsista_integral_regular,
    BOOL_OR(
      (ac.tipo_codigo = 'BOLSISTA_INT' OR ac.tipo_aluno = 'bolsista_integral')
      AND ac.is_banda_operacional = false
      AND ac.is_segundo_operacional = true
    ) AS bolsista_integral_segundo,
    BOOL_OR(
      (ac.tipo_codigo = 'BOLSISTA_PARC' OR ac.tipo_aluno = 'bolsista_parcial')
      AND ac.is_banda_operacional = false
    ) AS bolsista_parcial,
    COUNT(*) FILTER (
      WHERE ac.is_segundo_operacional = true
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS segundos_cursos
  FROM alunos_classificados ac
  WHERE ac.entra_carteira_operacional = true
  GROUP BY ac.unidade_id, ac.pessoa_key
),
matriculas_ativas AS (
  SELECT
    ub.unidade_id,
    COUNT(ac.id) FILTER (
      WHERE ac.status = 'ativo'
        AND ac.is_banda_operacional = true
    )::integer AS matriculas_banda,
    COUNT(ac.id) FILTER (
      WHERE ac.entra_carteira_operacional = true
        AND ac.is_segundo_operacional = true
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS matriculas_2_curso,
    COUNT(DISTINCT ac.pessoa_key) FILTER (
      WHERE ac.entra_carteira_operacional = true
        AND ac.is_segundo_operacional = true
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS alunos_com_2_curso,
    COUNT(ac.id) FILTER (
      WHERE ac.status = 'ativo'
        AND ac.is_coral = true
    )::integer AS matriculas_coral
  FROM unidades_base ub
  LEFT JOIN alunos_classificados ac ON ac.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
trancados AS (
  SELECT
    ub.unidade_id,
    COUNT(DISTINCT ac.pessoa_key) FILTER (
      WHERE ac.status = 'trancado'
        AND ac.is_banda_operacional = false
        AND ac.is_coral = false
    )::integer AS alunos_trancados
  FROM unidades_base ub
  LEFT JOIN alunos_classificados ac ON ac.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
novas AS (
  SELECT
    ub.unidade_id,
    COUNT(DISTINCT ac.pessoa_key) FILTER (
      WHERE ac.status = 'ativo'
        AND ac.data_matricula >= p.inicio_mes
        AND ac.data_matricula <= p.data_corte
        AND ac.is_banda_operacional = false
        AND ac.is_segundo_operacional = false
        AND ac.is_coral = false
        AND ac.tipo_codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
        AND COALESCE(ac.tipo_aluno, '') NOT IN ('bolsista_integral', 'bolsista_parcial')
        AND (ac.conta_como_pagante = true OR ac.entra_ticket_medio = true)
        AND ac.valor_parcela > 0
    )::integer AS novas_matriculas
  FROM unidades_base ub
  CROSS JOIN params p
  LEFT JOIN alunos_classificados ac ON ac.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
por_unidade AS (
  SELECT
    ub.unidade_id,
    ub.unidade_nome,
    p_ano AS ano,
    p_mes AS mes,
    COUNT(pa.pessoa_key)::integer AS alunos_ativos,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.mrr > 0)::integer AS alunos_pagantes,
    GREATEST(COUNT(pa.pessoa_key)::integer - COUNT(pa.pessoa_key) FILTER (WHERE pa.mrr > 0)::integer, 0)::integer AS alunos_nao_pagantes,
    COUNT(pa.pessoa_key) FILTER (
      WHERE pa.bolsista_integral_regular = true OR pa.bolsista_integral_segundo = true
    )::integer AS bolsistas_integrais,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.bolsista_integral_regular = true)::integer AS bolsistas_integrais_regulares,
    COUNT(pa.pessoa_key) FILTER (
      WHERE pa.bolsista_integral_segundo = true AND pa.bolsista_integral_regular = false
    )::integer AS bolsistas_integrais_segundo_curso,
    COUNT(pa.pessoa_key) FILTER (WHERE pa.bolsista_parcial = true)::integer AS bolsistas_parciais,
    COALESCE(t.alunos_trancados, 0)::integer AS alunos_trancados,
    COALESCE(n.novas_matriculas, 0)::integer AS novas_matriculas,
    COUNT(pa.pessoa_key)::integer AS matriculas_base_alunos_ativos,
    COALESCE(ma.matriculas_banda, 0)::integer AS matriculas_banda,
    COALESCE(ma.matriculas_2_curso, 0)::integer AS matriculas_2_curso,
    COALESCE(ma.alunos_com_2_curso, 0)::integer AS alunos_com_2_curso,
    GREATEST(COALESCE(ma.matriculas_2_curso, 0) - COALESCE(ma.alunos_com_2_curso, 0), 0)::integer AS matriculas_2_curso_extras,
    COALESCE(ma.matriculas_coral, 0)::integer AS matriculas_coral,
    (
      COUNT(pa.pessoa_key)::integer
      + COALESCE(ma.matriculas_banda, 0)
      + COALESCE(ma.matriculas_2_curso, 0)
      + COALESCE(ma.matriculas_coral, 0)
    )::integer AS matriculas_ativas
  FROM unidades_base ub
  LEFT JOIN pessoas_ativas pa ON pa.unidade_id = ub.unidade_id
  LEFT JOIN matriculas_ativas ma ON ma.unidade_id = ub.unidade_id
  LEFT JOIN trancados t ON t.unidade_id = ub.unidade_id
  LEFT JOIN novas n ON n.unidade_id = ub.unidade_id
  GROUP BY
    ub.unidade_id,
    ub.unidade_nome,
    ma.matriculas_banda,
    ma.matriculas_2_curso,
    ma.alunos_com_2_curso,
    ma.matriculas_coral,
    t.alunos_trancados,
    n.novas_matriculas
),
totais AS (
  SELECT
    SUM(alunos_ativos)::integer AS alunos_ativos,
    SUM(alunos_pagantes)::integer AS alunos_pagantes,
    SUM(alunos_nao_pagantes)::integer AS alunos_nao_pagantes,
    SUM(bolsistas_integrais)::integer AS bolsistas_integrais,
    SUM(bolsistas_integrais_regulares)::integer AS bolsistas_integrais_regulares,
    SUM(bolsistas_integrais_segundo_curso)::integer AS bolsistas_integrais_segundo_curso,
    SUM(bolsistas_parciais)::integer AS bolsistas_parciais,
    SUM(alunos_trancados)::integer AS alunos_trancados,
    SUM(novas_matriculas)::integer AS novas_matriculas,
    SUM(matriculas_base_alunos_ativos)::integer AS matriculas_base_alunos_ativos,
    SUM(matriculas_banda)::integer AS matriculas_banda,
    SUM(matriculas_2_curso)::integer AS matriculas_2_curso,
    SUM(alunos_com_2_curso)::integer AS alunos_com_2_curso,
    SUM(matriculas_2_curso_extras)::integer AS matriculas_2_curso_extras,
    SUM(matriculas_coral)::integer AS matriculas_coral,
    SUM(matriculas_ativas)::integer AS matriculas_ativas
  FROM por_unidade
)
SELECT jsonb_build_object(
  'fonte', 'admin_operacional_vivo',
  'periodo', jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id
  ),
  'totais', to_jsonb(totais.*),
  'por_unidade', COALESCE(
    (SELECT jsonb_agg(to_jsonb(por_unidade.*) ORDER BY unidade_nome) FROM por_unidade),
    '[]'::jsonb
  ),
  'alertas_fonte', jsonb_build_array(
    'Relatorio administrativo operacional: aluno regular trancado continua na carteira; banda/projeto conta apenas quando ativo.'
  )
)
FROM totais;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_admin_operacional(uuid, integer, integer)
IS 'KPIs vivos para relatorio administrativo: aluno regular trancado permanece na carteira; banda/projeto conta apenas ativo; bolsista nao gera MRR/pagante.';

REVOKE ALL ON FUNCTION public.get_kpis_alunos_admin_operacional(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_admin_operacional(uuid, integer, integer) TO authenticated, service_role;
