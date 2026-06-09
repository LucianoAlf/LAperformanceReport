-- ============================================================================
-- P0.1Q - Financeiro vivo canonico na RPC de KPIs de alunos
-- Projeto alvo: ouqwbbermlzqqvtqwlul
-- Status: EXECUTAVEL SOMENTE COM CONEXAO CONFIRMADA NO PROJETO ALVO.
--
-- Contexto:
-- - P0.1G criou public.get_kpis_alunos_canonicos.
-- - A funcao ja entrega alunos ativos/pagantes/Kids/School pela regra viva.
-- - Mas no mes atual aberto ainda devolvia:
--   inadimplencia = 0, faturamento_realizado = mrr, reajuste_pct = 0.
--
-- Objetivo:
-- - Preservar a funcao P0.1G como base/rollback.
-- - Corrigir apenas os campos financeiros vivos na RPC consumida por
--   relatorios, IA e Edge Functions.
--
-- Nao faz:
-- - DDL em tabelas de negocio.
-- - UPDATE/DELETE/INSERT em dados historicos.
-- - backfill/recalculo/snapshot.
-- - fechamento de competencia.
-- - alteracao em views legadas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_financeiro_vivo_canonico(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer
)
RETURNS TABLE (
  unidade_id uuid,
  mrr numeric,
  alunos_pagantes integer,
  inadimplentes integer,
  inadimplencia_valor numeric,
  inadimplencia_pct numeric,
  faturamento_realizado numeric,
  reajustes_validos integer,
  reajuste_pct numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH params AS (
  SELECT
    (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
    make_date(p_ano, p_mes, 1) AS inicio_mes,
    LEAST(
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
    a.nome,
    a.unidade_id,
    COALESCE(a.valor_parcela, 0)::numeric AS valor_parcela,
    COALESCE(a.status_pagamento, '') AS status_pagamento,
    COALESCE(tm.entra_ticket_medio, false) AS entra_ticket_medio,
    CASE
      WHEN btrim(COALESCE(a.nome, '')) <> ''
        THEN lower(btrim(a.nome)) || '|' || a.unidade_id::text
      ELSE NULL
    END AS pessoa_key
  FROM public.alunos a
  JOIN unidades_base ub ON ub.unidade_id = a.unidade_id
  CROSS JOIN params p
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
    COALESCE(SUM(
      CASE
        WHEN ab.entra_ticket_medio = true AND ab.valor_parcela > 0
          THEN ab.valor_parcela
        ELSE 0
      END
    ), 0)::numeric AS mrr_pessoa,
    BOOL_OR(lower(ab.status_pagamento) = 'inadimplente' AND ab.valor_parcela > 0) AS inadimplente,
    COALESCE(SUM(
      CASE
        WHEN lower(ab.status_pagamento) = 'inadimplente' AND ab.valor_parcela > 0
          THEN ab.valor_parcela
        ELSE 0
      END
    ), 0)::numeric AS inadimplencia_valor_pessoa
  FROM alunos_base ab
  WHERE ab.pessoa_key IS NOT NULL
  GROUP BY ab.unidade_id, ab.pessoa_key
),
financeiro AS (
  SELECT
    ub.unidade_id,
    COALESCE(SUM(p.mrr_pessoa), 0)::numeric AS mrr,
    COUNT(p.pessoa_key) FILTER (WHERE p.mrr_pessoa > 0)::integer AS alunos_pagantes,
    COUNT(p.pessoa_key) FILTER (WHERE p.inadimplente = true)::integer AS inadimplentes,
    COALESCE(SUM(p.inadimplencia_valor_pessoa), 0)::numeric AS inadimplencia_valor
  FROM unidades_base ub
  LEFT JOIN pessoas p ON p.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
reajustes AS (
  SELECT
    ub.unidade_id,
    COUNT(ma.id)::integer AS reajustes_validos,
    COALESCE(AVG(
      ((COALESCE(ma.valor_parcela_novo, 0)::numeric - COALESCE(ma.valor_parcela_anterior, 0)::numeric)
        / NULLIF(COALESCE(ma.valor_parcela_anterior, 0)::numeric, 0)) * 100
    ), 0)::numeric AS reajuste_pct
  FROM unidades_base ub
  CROSS JOIN params p
  LEFT JOIN public.movimentacoes_admin ma
    ON ma.unidade_id = ub.unidade_id
   AND ma.tipo = 'renovacao'
   AND ma.data >= p.inicio_mes
   AND ma.data <= p.data_corte
   AND btrim(COALESCE(ma.agente_comercial, '')) <> ''
   AND COALESCE(ma.valor_parcela_anterior, 0)::numeric > 0
   AND COALESCE(ma.valor_parcela_novo, 0)::numeric > COALESCE(ma.valor_parcela_anterior, 0)::numeric
  GROUP BY ub.unidade_id
)
SELECT
  f.unidade_id,
  f.mrr,
  f.alunos_pagantes,
  f.inadimplentes,
  f.inadimplencia_valor,
  CASE
    WHEN f.alunos_pagantes > 0 THEN ROUND(f.inadimplentes::numeric / f.alunos_pagantes * 100, 2)
    ELSE 0
  END AS inadimplencia_pct,
  GREATEST(f.mrr - f.inadimplencia_valor, 0) AS faturamento_realizado,
  COALESCE(r.reajustes_validos, 0) AS reajustes_validos,
  COALESCE(ROUND(r.reajuste_pct, 2), 0) AS reajuste_pct
FROM financeiro f
LEFT JOIN reajustes r ON r.unidade_id = f.unidade_id;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_financeiro_vivo_canonico(uuid, integer, integer)
IS 'P0.1Q: complemento financeiro vivo canonico para inadimplencia, faturamento realizado e reajuste medio.';

DO $$
BEGIN
  IF to_regprocedure('public.get_kpis_alunos_canonicos_base_p01q(uuid, integer, integer)') IS NULL THEN
    IF to_regprocedure('public.get_kpis_alunos_canonicos(uuid, integer, integer)') IS NULL THEN
      RAISE EXCEPTION 'Funcao get_kpis_alunos_canonicos nao encontrada para wrapper P0.1Q';
    END IF;

    EXECUTE 'ALTER FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) RENAME TO get_kpis_alunos_canonicos_base_p01q';
  END IF;
END $$;

ALTER FUNCTION public.get_kpis_alunos_canonicos_base_p01q(uuid, integer, integer)
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
  v_fin record;
  v_tem_live boolean := false;
  v_total_mrr numeric := 0;
  v_total_pagantes integer := 0;
  v_total_inadimplentes integer := 0;
  v_total_inadimplencia_valor numeric := 0;
  v_total_faturamento_realizado numeric := 0;
  v_total_reajuste_peso integer := 0;
  v_total_reajuste_soma numeric := 0;
BEGIN
  v_result := public.get_kpis_alunos_canonicos_base_p01q(p_unidade_id, p_ano, p_mes);

  FOR v_obj IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_result->'por_unidade', '[]'::jsonb))
  LOOP
    IF v_obj->>'fonte' = 'vivo' THEN
      v_tem_live := true;

      SELECT *
      INTO v_fin
      FROM public.get_kpis_alunos_financeiro_vivo_canonico(
        (v_obj->>'unidade_id')::uuid,
        p_ano,
        p_mes
      )
      LIMIT 1;

      IF FOUND THEN
        v_obj := jsonb_set(v_obj, '{mrr}', to_jsonb(v_fin.mrr), true);
        v_obj := jsonb_set(v_obj, '{faturamento_previsto}', to_jsonb(v_fin.mrr), true);
        v_obj := jsonb_set(v_obj, '{faturamento_realizado}', to_jsonb(v_fin.faturamento_realizado), true);
        v_obj := jsonb_set(v_obj, '{inadimplencia}', to_jsonb(v_fin.inadimplencia_pct), true);
        v_obj := jsonb_set(v_obj, '{inadimplencia_pct}', to_jsonb(v_fin.inadimplencia_pct), true);
        v_obj := jsonb_set(v_obj, '{inadimplentes}', to_jsonb(v_fin.inadimplentes), true);
        v_obj := jsonb_set(v_obj, '{inadimplencia_valor}', to_jsonb(v_fin.inadimplencia_valor), true);
        v_obj := jsonb_set(v_obj, '{reajuste_pct}', to_jsonb(v_fin.reajuste_pct), true);
        v_obj := jsonb_set(v_obj, '{reajuste_medio}', to_jsonb(v_fin.reajuste_pct), true);
        v_obj := jsonb_set(v_obj, '{reajustes_validos}', to_jsonb(v_fin.reajustes_validos), true);
      END IF;
    END IF;

    v_por_unidade := v_por_unidade || jsonb_build_array(v_obj);

    v_total_mrr := v_total_mrr + COALESCE((v_obj->>'mrr')::numeric, 0);
    v_total_pagantes := v_total_pagantes + COALESCE((v_obj->>'alunos_pagantes')::integer, 0);
    v_total_inadimplentes := v_total_inadimplentes + COALESCE((v_obj->>'inadimplentes')::integer, 0);
    v_total_inadimplencia_valor := v_total_inadimplencia_valor + COALESCE((v_obj->>'inadimplencia_valor')::numeric, 0);
    v_total_faturamento_realizado := v_total_faturamento_realizado + COALESCE((v_obj->>'faturamento_realizado')::numeric, COALESCE((v_obj->>'mrr')::numeric, 0));
    v_total_reajuste_peso := v_total_reajuste_peso + COALESCE((v_obj->>'reajustes_validos')::integer, 0);
    v_total_reajuste_soma := v_total_reajuste_soma
      + (COALESCE((v_obj->>'reajuste_pct')::numeric, 0) * COALESCE((v_obj->>'reajustes_validos')::integer, 0));
  END LOOP;

  IF v_tem_live THEN
    v_result := jsonb_set(v_result, '{por_unidade}', v_por_unidade, true);
    v_result := jsonb_set(v_result, '{totais,mrr}', to_jsonb(v_total_mrr), true);
    v_result := jsonb_set(v_result, '{totais,arr}', to_jsonb(v_total_mrr * 12), true);
    v_result := jsonb_set(v_result, '{totais,faturamento_previsto}', to_jsonb(v_total_mrr), true);
    v_result := jsonb_set(v_result, '{totais,faturamento_realizado}', to_jsonb(v_total_faturamento_realizado), true);
    v_result := jsonb_set(v_result, '{totais,inadimplentes}', to_jsonb(v_total_inadimplentes), true);
    v_result := jsonb_set(v_result, '{totais,inadimplencia_valor}', to_jsonb(v_total_inadimplencia_valor), true);
    v_result := jsonb_set(v_result, '{totais,inadimplencia}', to_jsonb(
      CASE WHEN v_total_pagantes > 0 THEN ROUND(v_total_inadimplentes::numeric / v_total_pagantes * 100, 2) ELSE 0 END
    ), true);
    v_result := jsonb_set(v_result, '{totais,inadimplencia_pct}', to_jsonb(
      CASE WHEN v_total_pagantes > 0 THEN ROUND(v_total_inadimplentes::numeric / v_total_pagantes * 100, 2) ELSE 0 END
    ), true);
    v_result := jsonb_set(v_result, '{totais,reajustes_validos}', to_jsonb(v_total_reajuste_peso), true);
    v_result := jsonb_set(v_result, '{totais,reajuste_pct}', to_jsonb(
      CASE WHEN v_total_reajuste_peso > 0 THEN ROUND(v_total_reajuste_soma / v_total_reajuste_peso, 2) ELSE 0 END
    ), true);
    v_result := jsonb_set(v_result, '{totais,reajuste_medio}', to_jsonb(
      CASE WHEN v_total_reajuste_peso > 0 THEN ROUND(v_total_reajuste_soma / v_total_reajuste_peso, 2) ELSE 0 END
    ), true);
  END IF;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer)
IS 'P0.1Q wrapper: preserva P0.1G e corrige campos financeiros vivos de inadimplencia, faturamento realizado e reajuste medio.';

REVOKE ALL ON FUNCTION public.get_kpis_alunos_financeiro_vivo_canonico(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_kpis_alunos_canonicos_base_p01q(uuid, integer, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_financeiro_vivo_canonico(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_canonicos(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_kpis_alunos_canonicos_base_p01q(uuid, integer, integer) TO authenticated, service_role;

-- ============================================================================
-- CHECKLIST SELECT-ONLY POS-EXECUCAO
-- ============================================================================
--
-- SELECT public.get_kpis_alunos_canonicos(
--   '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 2026, 6
-- ) #> '{totais}' AS cg_jun_totais;
--
-- Esperado visualmente em 2026-06-09:
-- - alunos_ativos = 479
-- - alunos_pagantes = 449
-- - inadimplentes = 8
-- - inadimplencia_valor = 2822.00
-- - faturamento_realizado = faturamento_previsto - 2822.00
-- - reajuste_pct > 0 quando houver renovacao confirmada.
--
-- SELECT public.get_kpis_alunos_canonicos(
--   '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 2026, 6
-- ) #> '{totais}' AS barra_jun_totais;
--
-- Esperado visualmente em 2026-06-09:
-- - reajuste_pct ~ 10.9 para as duas renovacoes confirmadas da Barra.
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- DROP FUNCTION IF EXISTS public.get_kpis_alunos_canonicos(uuid, integer, integer);
-- ALTER FUNCTION public.get_kpis_alunos_canonicos_base_p01q(uuid, integer, integer)
--   RENAME TO get_kpis_alunos_canonicos;
-- DROP FUNCTION IF EXISTS public.get_kpis_alunos_financeiro_vivo_canonico(uuid, integer, integer);
-- ============================================================================
