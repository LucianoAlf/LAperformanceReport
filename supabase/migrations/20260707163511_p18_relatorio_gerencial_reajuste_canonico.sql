-- ============================================================================
-- P18 - Relatorio gerencial: reajuste medio canonico igual ao administrativo
--
-- Contexto:
-- - P15/P16/P17 alinharam retencao, evasoes, MRR perdido e payloads do
--   relatorio gerencial.
-- - O campo reajuste_medio ainda herdava valor agregado legado em kpis_gestao
--   (ex.: Barra Jun/2026 = 10.58), enquanto o relatorio mensal administrativo
--   recalcula pela lista canonica de renovacoes confirmadas da competencia
--   (Barra Jun/2026 = 10.17, exibido como 10.2%).
--
-- Estrategia:
-- - Preservar o wrapper atual e sobrescrever somente reajuste_medio/reajuste_pct.
-- - Usar movimentacoes_admin por competencia_referencia, com a mesma exclusao
--   operacional do frontend: somente renovacoes confirmadas, aumento positivo,
--   sem banda/projeto/coral/garage e sem bolsistas/banda.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p18_20260707(uuid, integer, integer)') IS NULL THEN
    ALTER FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer)
      RENAME TO get_dados_relatorio_gerencial_legacy_p18_20260707;
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
  v_kpis_gestao_arr jsonb;
  v_dados_mes_atual_arr jsonb;
  v_kpis_alunos jsonb;
  v_totais_patch jsonb;
BEGIN
  v_result := public.get_dados_relatorio_gerencial_legacy_p18_20260707(p_unidade_id, p_ano, p_mes);

  WITH params AS (
    SELECT
      make_date(p_ano, p_mes, 1)::date AS inicio_mes,
      (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date AS fim_mes
  ),
  reajustes_base AS (
    SELECT
      m.unidade_id,
      (
        (
          COALESCE(m.valor_parcela_novo, 0)::numeric
          - COALESCE(m.valor_parcela_anterior, a.valor_parcela, 0)::numeric
        )
        / NULLIF(COALESCE(m.valor_parcela_anterior, a.valor_parcela, 0)::numeric, 0)
      ) * 100 AS percentual_reajuste
    FROM public.movimentacoes_admin m
    CROSS JOIN params p
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    LEFT JOIN public.cursos c ON c.id = COALESCE(m.curso_id, a.curso_id)
    LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE m.tipo = 'renovacao'
      AND date_trunc('month', COALESCE(m.competencia_referencia, m.data)::date)::date >= p.inicio_mes
      AND date_trunc('month', COALESCE(m.competencia_referencia, m.data)::date)::date <= p.fim_mes
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      AND m.renovacao_status IN ('confirmada', 'antecipada_confirmada')
      AND COALESCE(m.valor_parcela_anterior, a.valor_parcela, 0)::numeric > 0
      AND COALESCE(m.valor_parcela_novo, 0)::numeric > COALESCE(m.valor_parcela_anterior, a.valor_parcela, 0)::numeric
      AND NOT (
        COALESCE(c.is_projeto_banda, false) = true
        OR lower(unaccent(COALESCE(c.nome, ''))) LIKE ANY (ARRAY[
          '%banda%',
          '%garage%',
          '%projeto%',
          '%coral%'
        ])
      )
      AND COALESCE(a.tipo_matricula_id, 0) NOT IN (3, 4, 5)
      AND NOT (
        lower(unaccent(COALESCE(tm.codigo, ''))) LIKE ANY (ARRAY[
          '%bolsista%',
          '%bolsa%',
          '%banda%'
        ])
        OR lower(unaccent(COALESCE(a.classificacao, ''))) LIKE ANY (ARRAY[
          '%bolsista%',
          '%bolsa%'
        ])
      )
  ),
  reajustes_unidade AS (
    SELECT
      unidade_id,
      COUNT(*)::integer AS reajustes_validos,
      ROUND(AVG(percentual_reajuste), 2) AS reajuste_medio
    FROM reajustes_base
    GROUP BY unidade_id
  ),
  reajustes_totais AS (
    SELECT
      COUNT(*)::integer AS reajustes_validos,
      COALESCE(ROUND(AVG(percentual_reajuste), 2), 0) AS reajuste_medio
    FROM reajustes_base
  ),
  gestao_patch AS (
    SELECT jsonb_agg(
      CASE
        WHEN r.unidade_id IS NOT NULL THEN
          elem || jsonb_build_object(
            'reajuste_medio', r.reajuste_medio,
            'reajuste_pct', r.reajuste_medio,
            'reajustes_validos', r.reajustes_validos
          )
        ELSE elem
      END
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(COALESCE(v_result->'kpis_gestao', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN reajustes_unidade r ON r.unidade_id::text = elem->>'unidade_id'
  ),
  dados_mes_patch AS (
    SELECT jsonb_agg(
      CASE
        WHEN r.unidade_id IS NOT NULL THEN
          elem || jsonb_build_object(
            'reajuste_medio', r.reajuste_medio,
            'reajuste_pct', r.reajuste_medio,
            'reajustes_validos', r.reajustes_validos
          )
        ELSE elem
      END
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(COALESCE(v_result->'dados_mes_atual', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN reajustes_unidade r ON r.unidade_id::text = elem->>'unidade_id'
  )
  SELECT
    COALESCE(gestao_patch.arr, COALESCE(v_result->'kpis_gestao', '[]'::jsonb)),
    COALESCE(dados_mes_patch.arr, COALESCE(v_result->'dados_mes_atual', '[]'::jsonb)),
    jsonb_build_object(
      'reajuste_medio', reajustes_totais.reajuste_medio,
      'reajuste_pct', reajustes_totais.reajuste_medio,
      'reajustes_validos', reajustes_totais.reajustes_validos
    )
  INTO v_kpis_gestao_arr, v_dados_mes_atual_arr, v_totais_patch
  FROM gestao_patch, dados_mes_patch, reajustes_totais;

  v_result := jsonb_set(v_result, '{kpis_gestao}', COALESCE(v_kpis_gestao_arr, '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{dados_mes_atual}', COALESCE(v_dados_mes_atual_arr, '[]'::jsonb), true);

  v_kpis_alunos := COALESCE(v_result->'kpis_alunos_canonicos', '{}'::jsonb);
  v_kpis_alunos := jsonb_set(
    v_kpis_alunos,
    '{por_unidade}',
    COALESCE(v_kpis_gestao_arr, '[]'::jsonb),
    true
  );
  v_kpis_alunos := jsonb_set(
    v_kpis_alunos,
    '{totais}',
    COALESCE(v_kpis_alunos->'totais', '{}'::jsonb) || COALESCE(v_totais_patch, '{}'::jsonb),
    true
  );
  v_result := jsonb_set(v_result, '{kpis_alunos_canonicos}', v_kpis_alunos, true);

  v_result := jsonb_set(
    v_result,
    '{kpis_reajuste_fonte}',
    to_jsonb('p18_reajuste_medio_canonico_movimentacoes_admin'::text),
    true
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) IS
  'P18: wrapper gerencial recalcula reajuste_medio/reajuste_pct por competencia com regra canonica do administrativo.';
