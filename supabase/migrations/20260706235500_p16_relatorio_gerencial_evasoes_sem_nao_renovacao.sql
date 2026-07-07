-- ============================================================================
-- P16 - Relatorio gerencial: Evasoes separadas de Nao Renovacoes
--
-- P15 alinhou a retencao canonica ao administrativo, mas Campo Grande expôs um
-- detalhe de apresentacao: o campo "Evasoes" do relatorio gerencial nao deve
-- somar "nao_renovacao", porque a propria Edge Function ja imprime uma linha
-- separada "Nao Renovacoes". O churn continua incluindo evasoes base + nao
-- renovacoes, pois essa e a regra de retencao.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p16_20260706(uuid, integer, integer)') IS NULL THEN
    ALTER FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer)
      RENAME TO get_dados_relatorio_gerencial_legacy_p16_20260706;
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
  v_kpis_retencao jsonb;
  v_kpis_gestao_arr jsonb;
  v_dados_mes_atual_arr jsonb;
  v_motivos_evasao jsonb;
BEGIN
  v_result := public.get_dados_relatorio_gerencial_legacy_p16_20260706(p_unidade_id, p_ano, p_mes);

  WITH retencao_canonica_base AS (
    SELECT
      m.id,
      m.unidade_id,
      m.tipo,
      m.data,
      coalesce('id:' || m.aluno_id::text, 'nome:' || lower(trim(coalesce(m.aluno_nome, ''))) || '|' || m.unidade_id::text) AS chave_pessoa,
      coalesce(nullif(trim(m.motivo), ''), 'Nao informado') AS motivo,
      coalesce(
        m.valor_parcela_evasao,
        m.valor_parcela_anterior,
        m.valor_parcela_novo,
        a.valor_parcela,
        0
      )::numeric AS valor_perdido,
      (
        coalesce(c.is_projeto_banda, false) = true
        OR lower(unaccent(coalesce(c.nome, ''))) LIKE ANY (ARRAY[
          '%canto coral%',
          '%power kids%',
          '%minha banda%',
          '%garageband%',
          '%percussion kids%'
        ])
      ) AS is_atividade_extra,
      CASE
        WHEN m.tipo = 'nao_renovacao' THEN 'nao_renovou'
        WHEN nullif(trim(coalesce(m.tipo_evasao, '')), '') IS NOT NULL THEN trim(m.tipo_evasao)
        WHEN coalesce(a.tipo_matricula_id, 0) = 5 THEN 'interrompido_banda'
        WHEN coalesce(a.is_segundo_curso, false) OR coalesce(a.tipo_matricula_id, 0) = 2 THEN 'interrompido_2_curso'
        WHEN coalesce(a.tipo_matricula_id, 0) IN (3, 4) THEN 'interrompido_bolsista'
        ELSE 'interrompido'
      END AS tipo_evasao_calc,
      (
        lower(unaccent(coalesce(m.tipo_evasao, ''))) LIKE '%transfer%'
        OR lower(unaccent(coalesce(m.motivo, ''))) LIKE '%transfer%'
      ) AS is_transferencia
    FROM public.movimentacoes_admin m
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    LEFT JOIN public.cursos c ON c.id = coalesce(m.curso_id, a.curso_id)
    WHERE m.data >= make_date(p_ano, p_mes, 1)
      AND m.data <= (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
  ),
  retencao_canonica_dedup AS (
    SELECT DISTINCT ON (unidade_id, tipo, chave_pessoa)
      *
    FROM retencao_canonica_base
    WHERE NOT is_atividade_extra
      AND (
        tipo = 'nao_renovacao'
        OR tipo_evasao_calc IN ('interrompido', 'transferencia', 'interrompido_bolsista')
      )
    ORDER BY unidade_id, tipo, chave_pessoa, data DESC NULLS LAST, id DESC
  ),
  retencao_canonica_resumo AS (
    SELECT
      d.unidade_id,
      count(*) FILTER (
        WHERE tipo = 'evasao'
          AND tipo_evasao_calc IN ('interrompido', 'transferencia')
      )::integer AS evasoes_base_alunos,
      count(*) FILTER (
        WHERE tipo = 'evasao'
          AND tipo_evasao_calc = 'interrompido_bolsista'
      )::integer AS evasoes_bolsista,
      count(*) FILTER (WHERE tipo = 'nao_renovacao')::integer AS nao_renovacoes,
      count(*) FILTER (WHERE is_transferencia)::integer AS transferencias,
      round(sum(valor_perdido) FILTER (
        WHERE tipo = 'nao_renovacao'
          OR (tipo = 'evasao' AND tipo_evasao_calc IN ('interrompido', 'transferencia'))
      )::numeric, 2) AS mrr_perdido
    FROM retencao_canonica_dedup d
    GROUP BY d.unidade_id
  ),
  retencao_canonica_com_base AS (
    SELECT
      r.*,
      coalesce(dm.alunos_pagantes, 0)::integer AS base_pagantes,
      (r.evasoes_base_alunos + r.evasoes_bolsista)::integer AS total_evasoes_display,
      greatest(r.evasoes_base_alunos + r.nao_renovacoes - r.transferencias, 0)::integer AS total_evasoes_churn,
      CASE
        WHEN r.evasoes_bolsista > 0 THEN r.evasoes_base_alunos::text || '+' || r.evasoes_bolsista::text || ' bolsista'
        ELSE r.evasoes_base_alunos::text
      END AS total_evasoes_label,
      CASE
        WHEN coalesce(dm.alunos_pagantes, 0) > 0 THEN
          round((greatest(r.evasoes_base_alunos + r.nao_renovacoes - r.transferencias, 0)::numeric / nullif(dm.alunos_pagantes, 0)) * 100, 2)
        ELSE 0
      END AS churn_rate
    FROM retencao_canonica_resumo r
    LEFT JOIN public.dados_mensais dm
      ON dm.unidade_id = r.unidade_id
     AND dm.ano = p_ano
     AND dm.mes = p_mes
  ),
  motivos_por_unidade AS (
    SELECT
      unidade_id,
      motivo,
      count(*)::integer AS quantidade,
      sum(count(*)) over (partition by unidade_id)::integer AS total
    FROM retencao_canonica_dedup
    WHERE tipo = 'evasao'
      AND tipo_evasao_calc IN ('interrompido', 'transferencia')
    GROUP BY unidade_id, motivo
  ),
  motivos_root AS (
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'motivo', motivo,
        'quantidade', quantidade,
        'percentual', CASE WHEN total > 0 THEN round((quantidade::numeric / total) * 100, 1) ELSE 0 END
      )
      ORDER BY quantidade DESC, motivo ASC
    ), '[]'::jsonb) AS arr
    FROM (
      SELECT
        motivo,
        sum(quantidade)::integer AS quantidade,
        sum(sum(quantidade)) over ()::integer AS total
      FROM motivos_por_unidade
      GROUP BY motivo
    ) m
  ),
  retencao_patch AS (
    SELECT jsonb_agg(
      CASE
        WHEN r.unidade_id IS NOT NULL THEN
          elem || jsonb_build_object(
            'total_evasoes', r.total_evasoes_display,
            'evasoes_interrompidas', r.total_evasoes_display,
            'evasoes_base_alunos', r.evasoes_base_alunos,
            'evasoes_bolsista', r.evasoes_bolsista,
            'total_evasoes_label', r.total_evasoes_label,
            'nao_renovacoes', r.nao_renovacoes,
            'transferencias', r.transferencias,
            'taxa_evasao', r.churn_rate,
            'churn_rate', r.churn_rate,
            'mrr_perdido', coalesce(r.mrr_perdido, 0)
          )
        ELSE elem
      END
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(coalesce(v_result->'kpis_retencao', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN retencao_canonica_com_base r ON r.unidade_id::text = elem->>'unidade_id'
  ),
  gestao_patch AS (
    SELECT jsonb_agg(
      CASE
        WHEN r.unidade_id IS NOT NULL THEN
          elem || jsonb_build_object(
            'evasoes', r.total_evasoes_display,
            'total_evasoes', r.total_evasoes_display,
            'evasoes_base_alunos', r.evasoes_base_alunos,
            'evasoes_bolsista', r.evasoes_bolsista,
            'total_evasoes_label', r.total_evasoes_label,
            'churn_rate', r.churn_rate,
            'saldo_liquido', coalesce(nullif(elem->>'novas_matriculas', '')::numeric, 0) - r.total_evasoes_display
          )
        ELSE elem
      END
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(coalesce(v_result->'kpis_gestao', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN retencao_canonica_com_base r ON r.unidade_id::text = elem->>'unidade_id'
  ),
  dados_mes_patch AS (
    SELECT jsonb_agg(
      CASE
        WHEN r.unidade_id IS NOT NULL THEN
          elem || jsonb_build_object(
            'evasoes', r.total_evasoes_display,
            'total_evasoes', r.total_evasoes_display,
            'evasoes_base_alunos', r.evasoes_base_alunos,
            'evasoes_bolsista', r.evasoes_bolsista,
            'total_evasoes_label', r.total_evasoes_label,
            'churn_rate', r.churn_rate,
            'saldo_liquido', coalesce(nullif(elem->>'novas_matriculas', '')::numeric, 0) - r.total_evasoes_display
          )
        ELSE elem
      END
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(coalesce(v_result->'dados_mes_atual', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN retencao_canonica_com_base r ON r.unidade_id::text = elem->>'unidade_id'
  )
  SELECT
    coalesce(retencao_patch.arr, coalesce(v_result->'kpis_retencao', '[]'::jsonb)),
    coalesce(gestao_patch.arr, coalesce(v_result->'kpis_gestao', '[]'::jsonb)),
    coalesce(dados_mes_patch.arr, coalesce(v_result->'dados_mes_atual', '[]'::jsonb)),
    coalesce(motivos_root.arr, '[]'::jsonb)
  INTO
    v_kpis_retencao,
    v_kpis_gestao_arr,
    v_dados_mes_atual_arr,
    v_motivos_evasao
  FROM retencao_patch, gestao_patch, dados_mes_patch, motivos_root;

  v_result := jsonb_set(v_result, '{kpis_retencao}', coalesce(v_kpis_retencao, '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{kpis_gestao}', coalesce(v_kpis_gestao_arr, '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{dados_mes_atual}', coalesce(v_dados_mes_atual_arr, '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{motivos_evasao}', coalesce(v_motivos_evasao, '[]'::jsonb), true);
  v_result := jsonb_set(
    v_result,
    '{kpis_retencao_mrr_fonte}',
    to_jsonb('p16_retencao_canonica_evasoes_sem_nao_renovacao'::text),
    true
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) IS
  'P16: wrapper gerencial separa evasoes de nao renovacoes no texto e mantem churn canonico com ambos.';
