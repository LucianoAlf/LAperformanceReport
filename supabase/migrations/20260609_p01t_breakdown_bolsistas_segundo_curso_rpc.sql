-- ============================================================================
-- P0.1T - Breakdown canonico de matriculas, bolsistas integrais e 2o curso
-- Projeto alvo: ouqwbbermlzqqvtqwlul
-- Status: EXECUTAVEL SOMENTE COM CONEXAO CONFIRMADA NO PROJETO ALVO.
--
-- Contexto:
-- - A RPC public.get_kpis_alunos_canonicos ja e a fonte canonica para cards,
--   relatorios e Edge Function do relatorio administrativo.
-- - Recreio/Junho revelou duas leituras que precisam aparecer de forma
--   explicita, sem mudar os totais:
--   1) matriculas_ativas = base de alunos ativos + vinculos extras de
--      banda/projeto + 2o curso + coral.
--   2) matriculas_2_curso = vinculos; alunos_com_2_curso = pessoas;
--      extras = vinculos - pessoas. Ex.: 24 (22 alunos + 2 extras).
--   3) bolsistas_integrais = pessoas unicas; detalhe separa regulares e
--      bolsistas que aparecem apenas como 2o curso.
--
-- Nao faz:
-- - DDL em tabelas de negocio.
-- - UPDATE/DELETE/INSERT em dados historicos.
-- - backfill/recalculo/snapshot.
-- - fechamento de competencia.
-- - alteracao em dados_mensais.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_vinculos_vivo_canonico(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer
)
RETURNS TABLE (
  unidade_id uuid,
  matriculas_base_alunos_ativos integer,
  alunos_com_2_curso integer,
  matriculas_2_curso_extras integer,
  bolsistas_integrais_regulares integer,
  bolsistas_integrais_segundo_curso integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH params AS (
  SELECT LEAST(
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
  ) AS data_corte
),
unidades_base AS (
  SELECT u.id AS unidade_id
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
alunos_base AS (
  SELECT
    a.id,
    a.unidade_id,
    CASE
      WHEN btrim(COALESCE(a.nome, '')) <> ''
        THEN lower(btrim(a.nome)) || '|' || a.unidade_id::text
      ELSE NULL
    END AS pessoa_key,
    COALESCE(a.is_segundo_curso, false) AS is_segundo_curso,
    COALESCE(c.is_projeto_banda, false) AS is_banda,
    lower(COALESCE(c.nome, '')) LIKE '%coral%' AS is_coral,
    COALESCE(tm.codigo, '') AS tipo_codigo
  FROM public.alunos a
  JOIN unidades_base ub ON ub.unidade_id = a.unidade_id
  CROSS JOIN params p
  LEFT JOIN public.cursos c ON c.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.arquivado_em IS NULL
    AND a.status IN ('ativo', 'trancado')
    AND (a.data_matricula IS NULL OR a.data_matricula <= p.data_corte)
    AND (a.data_saida IS NULL OR a.data_saida > p.data_corte)
),
pessoas AS (
  SELECT
    ab.unidade_id,
    ab.pessoa_key,
    COUNT(*) FILTER (
      WHERE ab.is_segundo_curso = true
        AND ab.is_banda = false
        AND ab.is_coral = false
    )::integer AS segundos_cursos,
    BOOL_OR(
      ab.tipo_codigo = 'BOLSISTA_INT'
      AND ab.is_banda = false
      AND ab.is_segundo_curso = false
    ) AS bolsista_integral_regular,
    BOOL_OR(
      ab.tipo_codigo = 'BOLSISTA_INT'
      AND ab.is_banda = false
      AND ab.is_segundo_curso = true
    ) AS bolsista_integral_segundo_curso
  FROM alunos_base ab
  WHERE ab.pessoa_key IS NOT NULL
  GROUP BY ab.unidade_id, ab.pessoa_key
),
matriculas AS (
  SELECT
    ub.unidade_id,
    COUNT(ab.id) FILTER (
      WHERE ab.is_segundo_curso = true
        AND ab.is_banda = false
        AND ab.is_coral = false
    )::integer AS matriculas_2_curso
  FROM unidades_base ub
  LEFT JOIN alunos_base ab ON ab.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
)
SELECT
  ub.unidade_id,
  COUNT(p.pessoa_key)::integer AS matriculas_base_alunos_ativos,
  COUNT(p.pessoa_key) FILTER (WHERE p.segundos_cursos > 0)::integer AS alunos_com_2_curso,
  GREATEST(
    COALESCE(m.matriculas_2_curso, 0)
      - COUNT(p.pessoa_key) FILTER (WHERE p.segundos_cursos > 0),
    0
  )::integer AS matriculas_2_curso_extras,
  COUNT(p.pessoa_key) FILTER (WHERE p.bolsista_integral_regular = true)::integer AS bolsistas_integrais_regulares,
  COUNT(p.pessoa_key) FILTER (
    WHERE p.bolsista_integral_segundo_curso = true
      AND p.bolsista_integral_regular = false
  )::integer AS bolsistas_integrais_segundo_curso
FROM unidades_base ub
LEFT JOIN pessoas p ON p.unidade_id = ub.unidade_id
LEFT JOIN matriculas m ON m.unidade_id = ub.unidade_id
GROUP BY ub.unidade_id, m.matriculas_2_curso;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_vinculos_vivo_canonico(uuid, integer, integer)
IS 'P0.1T: breakdown vivo canonico de 2o curso e bolsistas integrais para cards/relatorios.';

DO $$
BEGIN
  IF to_regprocedure('public.get_kpis_alunos_canonicos_base_p01t(uuid, integer, integer)') IS NULL THEN
    IF to_regprocedure('public.get_kpis_alunos_canonicos(uuid, integer, integer)') IS NULL THEN
      RAISE EXCEPTION 'Funcao get_kpis_alunos_canonicos nao encontrada para wrapper P0.1T';
    END IF;

    EXECUTE 'ALTER FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) RENAME TO get_kpis_alunos_canonicos_base_p01t';
  END IF;
END $$;

ALTER FUNCTION public.get_kpis_alunos_canonicos_base_p01t(uuid, integer, integer)
  SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_canonicos(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result jsonb;
  v_por_unidade jsonb := '[]'::jsonb;
  v_obj jsonb;
  v_vinc record;
  v_total_matriculas_ativas integer := 0;
  v_total_matriculas_base_alunos_ativos integer := 0;
  v_total_alunos_com_2_curso integer := 0;
  v_total_matriculas_2_curso_extras integer := 0;
  v_total_bolsistas_integrais_regulares integer := 0;
  v_total_bolsistas_integrais_segundo_curso integer := 0;
BEGIN
  v_result := public.get_kpis_alunos_canonicos_base_p01t(p_unidade_id, p_ano, p_mes);

  FOR v_obj IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_result->'por_unidade', '[]'::jsonb))
  LOOP
    IF v_obj->>'fonte' = 'vivo' THEN
      SELECT *
      INTO v_vinc
      FROM public.get_kpis_alunos_vinculos_vivo_canonico(
        (v_obj->>'unidade_id')::uuid,
        p_ano,
        p_mes
      )
      LIMIT 1;

      IF FOUND THEN
        v_obj := jsonb_set(v_obj, '{matriculas_base_alunos_ativos}', to_jsonb(v_vinc.matriculas_base_alunos_ativos), true);
        v_obj := jsonb_set(v_obj, '{alunos_com_2_curso}', to_jsonb(v_vinc.alunos_com_2_curso), true);
        v_obj := jsonb_set(v_obj, '{matriculas_2_curso_extras}', to_jsonb(v_vinc.matriculas_2_curso_extras), true);
        v_obj := jsonb_set(v_obj, '{bolsistas_integrais_regulares}', to_jsonb(v_vinc.bolsistas_integrais_regulares), true);
        v_obj := jsonb_set(v_obj, '{bolsistas_integrais_segundo_curso}', to_jsonb(v_vinc.bolsistas_integrais_segundo_curso), true);
        v_obj := jsonb_set(
          v_obj,
          '{matriculas_ativas}',
          to_jsonb(
            COALESCE(v_vinc.matriculas_base_alunos_ativos, 0)
              + COALESCE((v_obj->>'matriculas_banda')::integer, 0)
              + COALESCE((v_obj->>'matriculas_2_curso')::integer, 0)
              + COALESCE((v_obj->>'matriculas_coral')::integer, 0)
          ),
          true
        );
      END IF;
    ELSE
      v_obj := jsonb_set(
        v_obj,
        '{matriculas_base_alunos_ativos}',
        to_jsonb(
          COALESCE(
            (v_obj->>'matriculas_base_alunos_ativos')::integer,
            COALESCE((v_obj->>'alunos_ativos')::integer, 0)
          )
        ),
        true
      );
      v_obj := jsonb_set(v_obj, '{alunos_com_2_curso}', to_jsonb(COALESCE((v_obj->>'alunos_com_2_curso')::integer, 0)), true);
      v_obj := jsonb_set(v_obj, '{matriculas_2_curso_extras}', to_jsonb(COALESCE((v_obj->>'matriculas_2_curso_extras')::integer, 0)), true);
      v_obj := jsonb_set(v_obj, '{bolsistas_integrais_regulares}', to_jsonb(COALESCE((v_obj->>'bolsistas_integrais_regulares')::integer, 0)), true);
      v_obj := jsonb_set(v_obj, '{bolsistas_integrais_segundo_curso}', to_jsonb(COALESCE((v_obj->>'bolsistas_integrais_segundo_curso')::integer, 0)), true);
    END IF;

    v_por_unidade := v_por_unidade || jsonb_build_array(v_obj);
    v_total_matriculas_ativas := v_total_matriculas_ativas + COALESCE((v_obj->>'matriculas_ativas')::integer, 0);
    v_total_matriculas_base_alunos_ativos := v_total_matriculas_base_alunos_ativos + COALESCE((v_obj->>'matriculas_base_alunos_ativos')::integer, 0);
    v_total_alunos_com_2_curso := v_total_alunos_com_2_curso + COALESCE((v_obj->>'alunos_com_2_curso')::integer, 0);
    v_total_matriculas_2_curso_extras := v_total_matriculas_2_curso_extras + COALESCE((v_obj->>'matriculas_2_curso_extras')::integer, 0);
    v_total_bolsistas_integrais_regulares := v_total_bolsistas_integrais_regulares + COALESCE((v_obj->>'bolsistas_integrais_regulares')::integer, 0);
    v_total_bolsistas_integrais_segundo_curso := v_total_bolsistas_integrais_segundo_curso + COALESCE((v_obj->>'bolsistas_integrais_segundo_curso')::integer, 0);
  END LOOP;

  v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(v_result, '{totais,matriculas_ativas}', to_jsonb(v_total_matriculas_ativas), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_base_alunos_ativos}', to_jsonb(v_total_matriculas_base_alunos_ativos), true);
  v_result := jsonb_set(v_result, '{totais,alunos_com_2_curso}', to_jsonb(v_total_alunos_com_2_curso), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_2_curso_extras}', to_jsonb(v_total_matriculas_2_curso_extras), true);
  v_result := jsonb_set(v_result, '{totais,bolsistas_integrais_regulares}', to_jsonb(v_total_bolsistas_integrais_regulares), true);
  v_result := jsonb_set(v_result, '{totais,bolsistas_integrais_segundo_curso}', to_jsonb(v_total_bolsistas_integrais_segundo_curso), true);

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer)
IS 'P0.1T wrapper: preserva P0.1G/P0.1Q/P0.1R e adiciona breakdown de matriculas, 2o curso e bolsistas integrais.';

REVOKE ALL ON FUNCTION public.get_kpis_alunos_vinculos_vivo_canonico(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_kpis_alunos_canonicos_base_p01t(uuid, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_vinculos_vivo_canonico(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_canonicos_base_p01t(uuid, integer, integer) TO authenticated, service_role;

-- ============================================================================
-- CHECKLIST SELECT-ONLY POS-EXECUCAO
-- ============================================================================
--
-- SELECT public.get_kpis_alunos_canonicos(
--   '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 2026, 6
-- ) #> '{totais}' AS recreio_jun_totais;
--
-- Esperado para Recreio/Junho apos validacao operacional:
-- - matriculas_ativas = 411
-- - matriculas_base_alunos_ativos = 328
-- - matriculas_banda = 59
-- - matriculas_2_curso = 24
-- - alunos_com_2_curso = 22
-- - matriculas_2_curso_extras = 2
-- - bolsistas_integrais = 9
-- - bolsistas_integrais_regulares = 7
-- - bolsistas_integrais_segundo_curso = 2
--
-- SELECT public.get_kpis_alunos_vinculos_vivo_canonico(
--   '95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 2026, 6
-- );
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- DROP FUNCTION IF EXISTS public.get_kpis_alunos_canonicos(uuid, integer, integer);
-- ALTER FUNCTION public.get_kpis_alunos_canonicos_base_p01t(uuid, integer, integer)
--   RENAME TO get_kpis_alunos_canonicos;
-- DROP FUNCTION IF EXISTS public.get_kpis_alunos_vinculos_vivo_canonico(uuid, integer, integer);
-- ============================================================================
