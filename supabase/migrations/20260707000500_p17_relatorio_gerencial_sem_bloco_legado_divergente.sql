-- ============================================================================
-- P17 - Relatorio gerencial: remover divergencia do bloco kpis_alunos_canonicos
--
-- P16 corrigiu os blocos efetivamente usados pelo texto gerencial
-- (kpis_gestao, kpis_retencao, dados_mes_atual e motivos_evasao). Ainda assim,
-- a resposta JSON mantinha kpis_alunos_canonicos com numeros herdados do legado.
-- Esse wrapper reaproveita o resultado gerencial ja corrigido e espelha os
-- mesmos KPIs no bloco legado para evitar duas verdades no mesmo payload.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p17_20260707(uuid, integer, integer)') IS NULL THEN
    ALTER FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer)
      RENAME TO get_dados_relatorio_gerencial_legacy_p17_20260707;
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
  v_kpis_alunos jsonb;
  v_totais_patch jsonb;
BEGIN
  v_result := public.get_dados_relatorio_gerencial_legacy_p17_20260707(p_unidade_id, p_ano, p_mes);

  WITH gestao AS (
    SELECT
      elem,
      coalesce(nullif(elem->>'mrr', '')::numeric, 0) AS mrr,
      coalesce(nullif(elem->>'arr', '')::numeric, 0) AS arr,
      coalesce(nullif(elem->>'alunos_ativos', '')::numeric, 0) AS alunos_ativos,
      coalesce(nullif(elem->>'total_alunos_ativos', '')::numeric, 0) AS total_alunos_ativos,
      coalesce(nullif(elem->>'alunos_pagantes', '')::numeric, 0) AS alunos_pagantes,
      coalesce(nullif(elem->>'total_alunos_pagantes', '')::numeric, 0) AS total_alunos_pagantes,
      coalesce(nullif(elem->>'alunos_nao_pagantes', '')::numeric, 0) AS alunos_nao_pagantes,
      coalesce(nullif(elem->>'bolsistas_integrais', '')::numeric, 0) AS bolsistas_integrais,
      coalesce(nullif(elem->>'total_bolsistas_integrais', '')::numeric, 0) AS total_bolsistas_integrais,
      coalesce(nullif(elem->>'bolsistas_parciais', '')::numeric, 0) AS bolsistas_parciais,
      coalesce(nullif(elem->>'total_bolsistas_parciais', '')::numeric, 0) AS total_bolsistas_parciais,
      coalesce(nullif(elem->>'matriculas_ativas', '')::numeric, 0) AS matriculas_ativas,
      coalesce(nullif(elem->>'matriculas_banda', '')::numeric, 0) AS matriculas_banda,
      coalesce(nullif(elem->>'matriculas_2_curso', '')::numeric, 0) AS matriculas_2_curso,
      coalesce(nullif(elem->>'matriculas_coral', '')::numeric, 0) AS matriculas_coral,
      coalesce(nullif(elem->>'novas_matriculas', '')::numeric, 0) AS novas_matriculas,
      coalesce(nullif(elem->>'evasoes', '')::numeric, 0) AS evasoes,
      coalesce(nullif(elem->>'total_evasoes', '')::numeric, 0) AS total_evasoes,
      coalesce(nullif(elem->>'evasoes_base_alunos', '')::numeric, 0) AS evasoes_base_alunos,
      coalesce(nullif(elem->>'evasoes_bolsista', '')::numeric, 0) AS evasoes_bolsista,
      coalesce(nullif(elem->>'saldo_liquido', '')::numeric, 0) AS saldo_liquido,
      coalesce(nullif(elem->>'churn_rate', '')::numeric, 0) AS churn_rate,
      coalesce(nullif(elem->>'inadimplencia', '')::numeric, 0) AS inadimplencia,
      coalesce(nullif(elem->>'inadimplencia_pct', '')::numeric, 0) AS inadimplencia_pct,
      coalesce(nullif(elem->>'reajuste_medio', '')::numeric, 0) AS reajuste_medio,
      coalesce(nullif(elem->>'reajuste_pct', '')::numeric, 0) AS reajuste_pct,
      coalesce(nullif(elem->>'tempo_permanencia', '')::numeric, 0) AS tempo_permanencia,
      coalesce(nullif(elem->>'tempo_permanencia_medio', '')::numeric, 0) AS tempo_permanencia_medio,
      coalesce(nullif(elem->>'ltv_medio', '')::numeric, 0) AS ltv_medio,
      coalesce(nullif(elem->>'faturamento_previsto', '')::numeric, 0) AS faturamento_previsto,
      coalesce(nullif(elem->>'faturamento_realizado', '')::numeric, 0) AS faturamento_realizado
    FROM jsonb_array_elements(coalesce(v_result->'kpis_gestao', '[]'::jsonb)) AS e(elem)
  ),
  totais_patch AS (
    SELECT jsonb_build_object(
      'mrr', round(sum(mrr), 2),
      'arr', round(sum(arr), 2),
      'alunos_ativos', sum(alunos_ativos)::integer,
      'total_alunos_ativos', sum(coalesce(nullif(total_alunos_ativos, 0), alunos_ativos))::integer,
      'alunos_pagantes', sum(alunos_pagantes)::integer,
      'total_alunos_pagantes', sum(coalesce(nullif(total_alunos_pagantes, 0), alunos_pagantes))::integer,
      'alunos_nao_pagantes', sum(alunos_nao_pagantes)::integer,
      'bolsistas_integrais', sum(bolsistas_integrais)::integer,
      'total_bolsistas_integrais', sum(coalesce(nullif(total_bolsistas_integrais, 0), bolsistas_integrais))::integer,
      'bolsistas_parciais', sum(bolsistas_parciais)::integer,
      'total_bolsistas_parciais', sum(coalesce(nullif(total_bolsistas_parciais, 0), bolsistas_parciais))::integer,
      'matriculas_ativas', sum(matriculas_ativas)::integer,
      'matriculas_banda', sum(matriculas_banda)::integer,
      'matriculas_2_curso', sum(matriculas_2_curso)::integer,
      'matriculas_coral', sum(matriculas_coral)::integer,
      'novas_matriculas', sum(novas_matriculas)::integer,
      'evasoes', sum(evasoes)::integer,
      'total_evasoes', sum(total_evasoes)::integer,
      'evasoes_base_alunos', sum(evasoes_base_alunos)::integer,
      'evasoes_bolsista', sum(evasoes_bolsista)::integer,
      'total_evasoes_label', CASE
        WHEN count(*) = 1 THEN max(elem->>'total_evasoes_label')
        ELSE sum(total_evasoes)::integer::text
      END,
      'saldo_liquido', sum(saldo_liquido)::integer,
      'churn_rate', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(churn_rate * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'ticket_medio', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(mrr) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'inadimplencia', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(inadimplencia * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'inadimplencia_pct', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(inadimplencia_pct * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'reajuste_medio', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(reajuste_medio * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'reajuste_pct', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(reajuste_pct * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'tempo_permanencia', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(tempo_permanencia * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'tempo_permanencia_medio', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(tempo_permanencia_medio * alunos_pagantes) / sum(alunos_pagantes), 2)
        ELSE 0
      END,
      'ltv_medio', CASE
        WHEN sum(alunos_pagantes) > 0 THEN round(sum(ltv_medio * alunos_pagantes) / sum(alunos_pagantes), 3)
        ELSE 0
      END,
      'faturamento_previsto', round(sum(faturamento_previsto), 2),
      'faturamento_realizado', round(sum(faturamento_realizado), 2)
    ) AS patch
    FROM gestao
  )
  SELECT patch
  INTO v_totais_patch
  FROM totais_patch;

  IF v_totais_patch IS NOT NULL THEN
    v_kpis_alunos := coalesce(v_result->'kpis_alunos_canonicos', '{}'::jsonb);
    v_kpis_alunos := jsonb_set(
      v_kpis_alunos,
      '{totais}',
      coalesce(v_kpis_alunos->'totais', '{}'::jsonb) || v_totais_patch,
      true
    );
    v_kpis_alunos := jsonb_set(
      v_kpis_alunos,
      '{por_unidade}',
      coalesce(v_result->'kpis_gestao', '[]'::jsonb),
      true
    );
    v_result := jsonb_set(v_result, '{kpis_alunos_canonicos}', v_kpis_alunos, true);
  END IF;

  v_result := jsonb_set(
    v_result,
    '{kpis_retencao_mrr_fonte}',
    to_jsonb('p17_kpis_alunos_canonicos_sem_divergencia'::text),
    true
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) IS
  'P17: wrapper gerencial espelha kpis_gestao corrigido em kpis_alunos_canonicos para evitar payload divergente.';
