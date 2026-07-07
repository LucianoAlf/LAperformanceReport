-- ============================================================================
-- P20 - Relatorio gerencial: corrigir renovacao pendente com status NULL
--
-- Contexto:
-- - P19 alinhou a taxa de renovacao do gerencial com a regra do administrativo.
-- - A primeira versao ainda deixava renovacoes sem status cair na logica
--   ternaria do Postgres: `NULL IN (...)` vira NULL, e `NOT NULL` continua
--   NULL, nao TRUE. Com isso, duas pendencias de Campo Grande Jun/2026 nao
--   entravam no denominador.
--
-- Estrategia:
-- - Preservar P19 como legado.
-- - Recalcular apenas o bloco kpis_retencao, usando COALESCE(..., false) na
--   expressao booleana de renovacao confirmada.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p20_20260707(uuid, integer, integer)') IS NULL THEN
    ALTER FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer)
      RENAME TO get_dados_relatorio_gerencial_legacy_p20_20260707;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_gerencial(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_kpis_retencao_arr jsonb;
BEGIN
  v_result := public.get_dados_relatorio_gerencial_legacy_p20_20260707(p_unidade_id, p_ano, p_mes);

  WITH params AS (
    SELECT
      make_date(p_ano, p_mes, 1)::date AS inicio_mes,
      (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date AS fim_mes
  ),
  unidades_payload AS (
    SELECT DISTINCT NULLIF(elem->>'unidade_id', '')::uuid AS unidade_id
    FROM jsonb_array_elements(COALESCE(v_result->'kpis_gestao', '[]'::jsonb)) AS e(elem)
    WHERE NULLIF(elem->>'unidade_id', '') IS NOT NULL
  ),
  mov_base AS (
    SELECT
      m.unidade_id,
      m.tipo,
      m.data,
      m.competencia_referencia,
      (
        COALESCE(m.renovacao_status IN ('confirmada', 'antecipada_confirmada'), false)
        OR (
          m.renovacao_status IS NULL
          AND COALESCE(trim(m.agente_comercial), '') <> ''
          AND (
            m.valor_parcela_anterior IS NOT NULL
            OR m.valor_parcela_novo IS NOT NULL
            OR m.forma_pagamento_id IS NOT NULL
          )
        )
      ) AS renovacao_confirmada,
      CASE
        WHEN m.aluno_id IS NOT NULL THEN 'id:' || m.aluno_id::text
        ELSE 'nome:' || lower(trim(COALESCE(m.aluno_nome, ''))) || '|' || m.unidade_id::text
      END AS pessoa_key,
      COALESCE(c.is_projeto_banda, false) AS is_projeto_banda,
      lower(unaccent(COALESCE(c.nome, ''))) AS curso_norm
    FROM public.movimentacoes_admin m
    JOIN unidades_payload up ON up.unidade_id = m.unidade_id
    LEFT JOIN public.cursos c ON c.id = m.curso_id
  ),
  mov_retencao AS (
    SELECT *
    FROM mov_base
    WHERE NOT (
      is_projeto_banda = true
      OR curso_norm LIKE '%canto coral%'
      OR curso_norm LIKE '%power kids%'
      OR curso_norm LIKE '%minha banda%'
      OR curso_norm LIKE '%garageband%'
      OR curso_norm LIKE '%percussion kids%'
    )
  ),
  renovacoes_por_unidade AS (
    SELECT
      mr.unidade_id,
      COUNT(*) FILTER (
        WHERE mr.tipo = 'renovacao'
          AND date_trunc('month', COALESCE(mr.competencia_referencia, mr.data)::date)::date
              BETWEEN (SELECT inicio_mes FROM params) AND (SELECT fim_mes FROM params)
          AND mr.renovacao_confirmada
      )::integer AS renovacoes_realizadas,
      COUNT(*) FILTER (
        WHERE mr.tipo = 'renovacao'
          AND date_trunc('month', COALESCE(mr.competencia_referencia, mr.data)::date)::date
              BETWEEN (SELECT inicio_mes FROM params) AND (SELECT fim_mes FROM params)
          AND NOT mr.renovacao_confirmada
      )::integer AS renovacoes_pendentes,
      COUNT(DISTINCT mr.pessoa_key) FILTER (
        WHERE mr.tipo = 'nao_renovacao'
          AND mr.data BETWEEN (SELECT inicio_mes FROM params) AND (SELECT fim_mes FROM params)
      )::integer AS nao_renovacoes
    FROM mov_retencao mr
    GROUP BY mr.unidade_id
  ),
  renovacoes_patch AS (
    SELECT
      up.unidade_id,
      COALESCE(r.renovacoes_realizadas, 0)::integer AS renovacoes_realizadas,
      COALESCE(r.renovacoes_pendentes, 0)::integer AS renovacoes_pendentes,
      COALESCE(r.nao_renovacoes, 0)::integer AS nao_renovacoes,
      (
        COALESCE(r.renovacoes_realizadas, 0)
        + COALESCE(r.renovacoes_pendentes, 0)
        + COALESCE(r.nao_renovacoes, 0)
      )::integer AS renovacoes_previstas
    FROM unidades_payload up
    LEFT JOIN renovacoes_por_unidade r ON r.unidade_id = up.unidade_id
  ),
  retencao_patch AS (
    SELECT jsonb_agg(
      elem || jsonb_build_object(
        'renovacoes_previstas', COALESCE(r.renovacoes_previstas, 0),
        'renovacoes_realizadas', COALESCE(r.renovacoes_realizadas, 0),
        'renovacoes_pendentes', COALESCE(r.renovacoes_pendentes, 0),
        'nao_renovacoes', COALESCE(r.nao_renovacoes, 0),
        'taxa_renovacao', CASE
          WHEN COALESCE(r.renovacoes_previstas, 0) > 0 THEN
            ROUND(COALESCE(r.renovacoes_realizadas, 0)::numeric / r.renovacoes_previstas::numeric * 100, 2)
          ELSE 0
        END,
        'taxa_nao_renovacao', CASE
          WHEN COALESCE(r.renovacoes_previstas, 0) > 0 THEN
            ROUND(COALESCE(r.nao_renovacoes, 0)::numeric / r.renovacoes_previstas::numeric * 100, 2)
          ELSE 0
        END
      )
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(COALESCE(v_result->'kpis_retencao', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN renovacoes_patch r ON r.unidade_id::text = elem->>'unidade_id'
  )
  SELECT COALESCE(retencao_patch.arr, COALESCE(v_result->'kpis_retencao', '[]'::jsonb))
  INTO v_kpis_retencao_arr
  FROM retencao_patch;

  v_result := jsonb_set(v_result, '{kpis_retencao}', COALESCE(v_kpis_retencao_arr, '[]'::jsonb), true);
  v_result := jsonb_set(
    v_result,
    '{kpis_renovacao_fonte}',
    to_jsonb('p20_movimentacoes_admin_retencao_canonica_sem_extras_null_safe'::text),
    true
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) IS
  'P20: wrapper gerencial corrige renovacoes pendentes com status NULL usando logica booleana null-safe.';
