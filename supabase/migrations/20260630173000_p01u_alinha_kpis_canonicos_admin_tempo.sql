-- ============================================================================
-- P0.1U - Alinha KPIs canonicos com contadores operacionais e permanencia viva
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Contexto:
-- - Junho/2026 esta em fechamento e nao pode gravar snapshot com divergencia.
-- - get_kpis_alunos_canonicos preserva financeiro vivo, mas herdava:
--   1) matriculas_banda da base_p01q, que contava banda trancada e ignorava
--      alguns registros tipo BANDA quando o curso nao estava marcado como banda.
--   2) tempo_permanencia/ltv_medio = 0 em competencia viva.
--
-- Nao faz:
-- - UPDATE/DELETE/INSERT em dados de aluno.
-- - fechamento de competencia.
-- - snapshot/backfill/sync.
-- ============================================================================

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
  v_admin_result jsonb;
  v_por_unidade jsonb := '[]'::jsonb;
  v_obj jsonb;
  v_admin_obj jsonb;
  v_vinc record;
  v_tempo record;
  v_has_vivo boolean := false;

  v_total_alunos_ativos integer := 0;
  v_total_alunos_nao_pagantes integer := 0;
  v_total_alunos_trancados integer := 0;
  v_total_novas_matriculas integer := 0;
  v_total_matriculas_ativas integer := 0;
  v_total_matriculas_base_alunos_ativos integer := 0;
  v_total_matriculas_banda integer := 0;
  v_total_matriculas_2_curso integer := 0;
  v_total_matriculas_coral integer := 0;
  v_total_alunos_com_2_curso integer := 0;
  v_total_matriculas_2_curso_extras integer := 0;
  v_total_bolsistas_integrais integer := 0;
  v_total_bolsistas_parciais integer := 0;
  v_total_bolsistas_integrais_regulares integer := 0;
  v_total_bolsistas_integrais_segundo_curso integer := 0;

  v_tempo_soma_meses numeric := 0;
  v_tempo_total_evasoes integer := 0;
  v_tempo_medio numeric := 0;
  v_ticket_total numeric := 0;
BEGIN
  v_result := public.get_kpis_alunos_canonicos_base_p01t(p_unidade_id, p_ano, p_mes);

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_result->'por_unidade', '[]'::jsonb)) AS t(value)
    WHERE value->>'fonte' = 'vivo'
  )
  INTO v_has_vivo;

  IF NOT v_has_vivo THEN
    RETURN v_result;
  END IF;

  v_admin_result := public.get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes);

  FOR v_obj IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_result->'por_unidade', '[]'::jsonb))
  LOOP
    IF v_obj->>'fonte' = 'vivo' THEN
      v_admin_obj := NULL;

      SELECT value
      INTO v_admin_obj
      FROM jsonb_array_elements(COALESCE(v_admin_result->'por_unidade', '[]'::jsonb)) AS t(value)
      WHERE value->>'unidade_id' = v_obj->>'unidade_id'
      LIMIT 1;

      IF v_admin_obj IS NOT NULL THEN
        v_obj := jsonb_set(v_obj, '{alunos_ativos}', to_jsonb(COALESCE((v_admin_obj->>'alunos_ativos')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{alunos_nao_pagantes}', to_jsonb(COALESCE((v_admin_obj->>'alunos_nao_pagantes')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{alunos_trancados}', to_jsonb(COALESCE((v_admin_obj->>'alunos_trancados')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{novas_matriculas}', to_jsonb(COALESCE((v_admin_obj->>'novas_matriculas')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{matriculas_ativas}', to_jsonb(COALESCE((v_admin_obj->>'matriculas_ativas')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{matriculas_base_alunos_ativos}', to_jsonb(COALESCE((v_admin_obj->>'matriculas_base_alunos_ativos')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{matriculas_banda}', to_jsonb(COALESCE((v_admin_obj->>'matriculas_banda')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{matriculas_2_curso}', to_jsonb(COALESCE((v_admin_obj->>'matriculas_2_curso')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{matriculas_coral}', to_jsonb(COALESCE((v_admin_obj->>'matriculas_coral')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{alunos_com_2_curso}', to_jsonb(COALESCE((v_admin_obj->>'alunos_com_2_curso')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{matriculas_2_curso_extras}', to_jsonb(COALESCE((v_admin_obj->>'matriculas_2_curso_extras')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{bolsistas_integrais}', to_jsonb(COALESCE((v_admin_obj->>'bolsistas_integrais')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{bolsistas_parciais}', to_jsonb(COALESCE((v_admin_obj->>'bolsistas_parciais')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{bolsistas_integrais_regulares}', to_jsonb(COALESCE((v_admin_obj->>'bolsistas_integrais_regulares')::integer, 0)), true);
        v_obj := jsonb_set(v_obj, '{bolsistas_integrais_segundo_curso}', to_jsonb(COALESCE((v_admin_obj->>'bolsistas_integrais_segundo_curso')::integer, 0)), true);
      ELSE
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
      END IF;

      SELECT *
      INTO v_tempo
      FROM public.get_tempo_permanencia((v_obj->>'unidade_id')::uuid, p_ano, p_mes)
      WHERE unidade_id = (v_obj->>'unidade_id')::uuid
      LIMIT 1;

      IF FOUND THEN
        v_obj := jsonb_set(v_obj, '{tempo_permanencia}', to_jsonb(COALESCE(v_tempo.tempo_permanencia_medio, 0)), true);
        v_obj := jsonb_set(v_obj, '{tempo_permanencia_medio}', to_jsonb(COALESCE(v_tempo.tempo_permanencia_medio, 0)), true);
        v_obj := jsonb_set(
          v_obj,
          '{ltv_medio}',
          to_jsonb(ROUND(COALESCE((v_obj->>'ticket_medio')::numeric, 0) * COALESCE(v_tempo.tempo_permanencia_medio, 0), 2)),
          true
        );
        v_tempo_soma_meses := v_tempo_soma_meses + COALESCE(v_tempo.soma_meses, 0);
        v_tempo_total_evasoes := v_tempo_total_evasoes + COALESCE(v_tempo.total_evasoes_elegiveis, 0);
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

    v_total_alunos_ativos := v_total_alunos_ativos + COALESCE((v_obj->>'alunos_ativos')::integer, 0);
    v_total_alunos_nao_pagantes := v_total_alunos_nao_pagantes + COALESCE((v_obj->>'alunos_nao_pagantes')::integer, 0);
    v_total_alunos_trancados := v_total_alunos_trancados + COALESCE((v_obj->>'alunos_trancados')::integer, 0);
    v_total_novas_matriculas := v_total_novas_matriculas + COALESCE((v_obj->>'novas_matriculas')::integer, 0);
    v_total_matriculas_ativas := v_total_matriculas_ativas + COALESCE((v_obj->>'matriculas_ativas')::integer, 0);
    v_total_matriculas_base_alunos_ativos := v_total_matriculas_base_alunos_ativos + COALESCE((v_obj->>'matriculas_base_alunos_ativos')::integer, 0);
    v_total_matriculas_banda := v_total_matriculas_banda + COALESCE((v_obj->>'matriculas_banda')::integer, 0);
    v_total_matriculas_2_curso := v_total_matriculas_2_curso + COALESCE((v_obj->>'matriculas_2_curso')::integer, 0);
    v_total_matriculas_coral := v_total_matriculas_coral + COALESCE((v_obj->>'matriculas_coral')::integer, 0);
    v_total_alunos_com_2_curso := v_total_alunos_com_2_curso + COALESCE((v_obj->>'alunos_com_2_curso')::integer, 0);
    v_total_matriculas_2_curso_extras := v_total_matriculas_2_curso_extras + COALESCE((v_obj->>'matriculas_2_curso_extras')::integer, 0);
    v_total_bolsistas_integrais := v_total_bolsistas_integrais + COALESCE((v_obj->>'bolsistas_integrais')::integer, 0);
    v_total_bolsistas_parciais := v_total_bolsistas_parciais + COALESCE((v_obj->>'bolsistas_parciais')::integer, 0);
    v_total_bolsistas_integrais_regulares := v_total_bolsistas_integrais_regulares + COALESCE((v_obj->>'bolsistas_integrais_regulares')::integer, 0);
    v_total_bolsistas_integrais_segundo_curso := v_total_bolsistas_integrais_segundo_curso + COALESCE((v_obj->>'bolsistas_integrais_segundo_curso')::integer, 0);

  END LOOP;

  IF v_tempo_total_evasoes > 0 THEN
    v_tempo_medio := ROUND(v_tempo_soma_meses / v_tempo_total_evasoes, 1);
  END IF;

  v_ticket_total := CASE
    WHEN COALESCE((v_result #>> '{totais,alunos_pagantes}')::numeric, 0) > 0 THEN
      ROUND(
        COALESCE((v_result #>> '{totais,mrr}')::numeric, 0)
          / COALESCE((v_result #>> '{totais,alunos_pagantes}')::numeric, 0),
        2
      )
    ELSE 0
  END;

  v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
  v_result := jsonb_set(v_result, '{totais,alunos_ativos}', to_jsonb(v_total_alunos_ativos), true);
  v_result := jsonb_set(v_result, '{totais,total_alunos_ativos}', to_jsonb(v_total_alunos_ativos), true);
  v_result := jsonb_set(v_result, '{totais,alunos_nao_pagantes}', to_jsonb(v_total_alunos_nao_pagantes), true);
  v_result := jsonb_set(v_result, '{totais,alunos_trancados}', to_jsonb(v_total_alunos_trancados), true);
  v_result := jsonb_set(v_result, '{totais,novas_matriculas}', to_jsonb(v_total_novas_matriculas), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_ativas}', to_jsonb(v_total_matriculas_ativas), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_base_alunos_ativos}', to_jsonb(v_total_matriculas_base_alunos_ativos), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_banda}', to_jsonb(v_total_matriculas_banda), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_2_curso}', to_jsonb(v_total_matriculas_2_curso), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_coral}', to_jsonb(v_total_matriculas_coral), true);
  v_result := jsonb_set(v_result, '{totais,alunos_com_2_curso}', to_jsonb(v_total_alunos_com_2_curso), true);
  v_result := jsonb_set(v_result, '{totais,matriculas_2_curso_extras}', to_jsonb(v_total_matriculas_2_curso_extras), true);
  v_result := jsonb_set(v_result, '{totais,bolsistas_integrais}', to_jsonb(v_total_bolsistas_integrais), true);
  v_result := jsonb_set(v_result, '{totais,total_bolsistas_integrais}', to_jsonb(v_total_bolsistas_integrais), true);
  v_result := jsonb_set(v_result, '{totais,bolsistas_parciais}', to_jsonb(v_total_bolsistas_parciais), true);
  v_result := jsonb_set(v_result, '{totais,total_bolsistas_parciais}', to_jsonb(v_total_bolsistas_parciais), true);
  v_result := jsonb_set(v_result, '{totais,bolsistas_integrais_regulares}', to_jsonb(v_total_bolsistas_integrais_regulares), true);
  v_result := jsonb_set(v_result, '{totais,bolsistas_integrais_segundo_curso}', to_jsonb(v_total_bolsistas_integrais_segundo_curso), true);
  v_result := jsonb_set(v_result, '{totais,tempo_permanencia}', to_jsonb(v_tempo_medio), true);
  v_result := jsonb_set(v_result, '{totais,tempo_permanencia_medio}', to_jsonb(v_tempo_medio), true);
  v_result := jsonb_set(v_result, '{totais,ltv_medio}', to_jsonb(ROUND(v_ticket_total * v_tempo_medio, 2)), true);

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer)
IS 'P0.1U wrapper: preserva financeiro vivo, alinha contadores estruturais com get_kpis_alunos_admin_operacional e injeta tempo/LTV de get_tempo_permanencia.';

REVOKE ALL ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) TO authenticated, service_role;

-- CHECKS POS-EXECUCAO:
-- SELECT public.get_kpis_alunos_canonicos(null, 2026, 6) #> '{totais}';
-- SELECT public.get_kpis_alunos_admin_operacional(null, 2026, 6) #> '{totais}';
