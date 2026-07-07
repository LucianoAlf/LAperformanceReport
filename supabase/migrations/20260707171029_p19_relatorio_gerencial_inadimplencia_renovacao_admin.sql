-- ============================================================================
-- P19 - Relatorio gerencial: inadimplencia e renovacao iguais ao administrativo
--
-- Contexto:
-- - P15/P16/P17/P18 alinharam retencao, evasoes, MRR perdido e reajuste.
-- - Ainda havia dois residuos de fonte:
--   1) inadimplencia vinha do percentual financeiro legado em alguns casos
--      (Recreio Jun/2026 = 0.31), enquanto o administrativo exibe
--      alunos_nao_pagantes / alunos_ativos.
--   2) taxa de renovacao vinha de bloco legado que ainda carregava atividades
--      extras em alguns cenarios (Campo Grande Jun/2026 = 94.59), enquanto o
--      administrativo filtra Power Kids, Minha Banda, GarageBand, coral etc.
--
-- Estrategia:
-- - Preservar o wrapper atual como legado P19.
-- - Recalcular apenas inadimplencia e renovacao no payload gerencial.
-- - Usar a mesma regra operacional do relatorio mensal administrativo.
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p19_20260707(uuid, integer, integer)') IS NULL THEN
    ALTER FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer)
      RENAME TO get_dados_relatorio_gerencial_legacy_p19_20260707;
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
  v_kpis_retencao_arr jsonb;
  v_kpis_alunos jsonb;
  v_inadimplencia_totais jsonb;
BEGIN
  v_result := public.get_dados_relatorio_gerencial_legacy_p19_20260707(p_unidade_id, p_ano, p_mes);

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
  inadimplencia_por_unidade AS (
    SELECT
      NULLIF(elem->>'unidade_id', '')::uuid AS unidade_id,
      COALESCE(NULLIF(elem->>'alunos_ativos', '')::numeric, 0) AS alunos_ativos,
      COALESCE(NULLIF(elem->>'alunos_nao_pagantes', '')::numeric, 0) AS alunos_nao_pagantes,
      CASE
        WHEN COALESCE(NULLIF(elem->>'alunos_ativos', '')::numeric, 0) > 0 THEN
          ROUND(
            COALESCE(NULLIF(elem->>'alunos_nao_pagantes', '')::numeric, 0)
            / COALESCE(NULLIF(elem->>'alunos_ativos', '')::numeric, 0)
            * 100,
            2
          )
        ELSE 0
      END AS inadimplencia_pct
    FROM jsonb_array_elements(COALESCE(v_result->'kpis_gestao', '[]'::jsonb)) AS e(elem)
    WHERE NULLIF(elem->>'unidade_id', '') IS NOT NULL
  ),
  mov_base AS (
    SELECT
      m.unidade_id,
      m.tipo,
      m.data,
      m.competencia_referencia,
      m.renovacao_status,
      m.agente_comercial,
      m.valor_parcela_anterior,
      m.valor_parcela_novo,
      m.forma_pagamento_id,
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
          AND (
            mr.renovacao_status IN ('confirmada', 'antecipada_confirmada')
            OR (
              mr.renovacao_status IS NULL
              AND COALESCE(trim(mr.agente_comercial), '') <> ''
              AND (
                mr.valor_parcela_anterior IS NOT NULL
                OR mr.valor_parcela_novo IS NOT NULL
                OR mr.forma_pagamento_id IS NOT NULL
              )
            )
          )
      )::integer AS renovacoes_realizadas,
      COUNT(*) FILTER (
        WHERE mr.tipo = 'renovacao'
          AND date_trunc('month', COALESCE(mr.competencia_referencia, mr.data)::date)::date
              BETWEEN (SELECT inicio_mes FROM params) AND (SELECT fim_mes FROM params)
          AND NOT (
            mr.renovacao_status IN ('confirmada', 'antecipada_confirmada')
            OR (
              mr.renovacao_status IS NULL
              AND COALESCE(trim(mr.agente_comercial), '') <> ''
              AND (
                mr.valor_parcela_anterior IS NOT NULL
                OR mr.valor_parcela_novo IS NOT NULL
                OR mr.forma_pagamento_id IS NOT NULL
              )
            )
          )
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
      )::integer AS renovacoes_previstas,
      CASE
        WHEN (
          COALESCE(r.renovacoes_realizadas, 0)
          + COALESCE(r.renovacoes_pendentes, 0)
          + COALESCE(r.nao_renovacoes, 0)
        ) > 0 THEN
          ROUND(
            COALESCE(r.renovacoes_realizadas, 0)::numeric
            / (
              COALESCE(r.renovacoes_realizadas, 0)
              + COALESCE(r.renovacoes_pendentes, 0)
              + COALESCE(r.nao_renovacoes, 0)
            )::numeric
            * 100,
            2
          )
        ELSE 0
      END AS taxa_renovacao,
      CASE
        WHEN (
          COALESCE(r.renovacoes_realizadas, 0)
          + COALESCE(r.renovacoes_pendentes, 0)
          + COALESCE(r.nao_renovacoes, 0)
        ) > 0 THEN
          ROUND(
            COALESCE(r.nao_renovacoes, 0)::numeric
            / (
              COALESCE(r.renovacoes_realizadas, 0)
              + COALESCE(r.renovacoes_pendentes, 0)
              + COALESCE(r.nao_renovacoes, 0)
            )::numeric
            * 100,
            2
          )
        ELSE 0
      END AS taxa_nao_renovacao
    FROM unidades_payload up
    LEFT JOIN renovacoes_por_unidade r ON r.unidade_id = up.unidade_id
  ),
  gestao_patch AS (
    SELECT jsonb_agg(
      elem || jsonb_build_object(
        'inadimplencia', COALESCE(i.inadimplencia_pct, 0),
        'inadimplencia_pct', COALESCE(i.inadimplencia_pct, 0)
      )
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(COALESCE(v_result->'kpis_gestao', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN inadimplencia_por_unidade i ON i.unidade_id::text = elem->>'unidade_id'
  ),
  dados_mes_patch AS (
    SELECT jsonb_agg(
      elem || jsonb_build_object(
        'inadimplencia', COALESCE(i.inadimplencia_pct, 0),
        'inadimplencia_pct', COALESCE(i.inadimplencia_pct, 0)
      )
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(COALESCE(v_result->'dados_mes_atual', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN inadimplencia_por_unidade i ON i.unidade_id::text = elem->>'unidade_id'
  ),
  retencao_patch AS (
    SELECT jsonb_agg(
      elem || jsonb_build_object(
        'renovacoes_previstas', COALESCE(r.renovacoes_previstas, 0),
        'renovacoes_realizadas', COALESCE(r.renovacoes_realizadas, 0),
        'renovacoes_pendentes', COALESCE(r.renovacoes_pendentes, 0),
        'nao_renovacoes', COALESCE(r.nao_renovacoes, 0),
        'taxa_renovacao', COALESCE(r.taxa_renovacao, 0),
        'taxa_nao_renovacao', COALESCE(r.taxa_nao_renovacao, 0)
      )
      ORDER BY ord
    ) AS arr
    FROM jsonb_array_elements(COALESCE(v_result->'kpis_retencao', '[]'::jsonb)) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN renovacoes_patch r ON r.unidade_id::text = elem->>'unidade_id'
  ),
  inadimplencia_totais AS (
    SELECT jsonb_build_object(
      'alunos_nao_pagantes', COALESCE(SUM(alunos_nao_pagantes), 0)::integer,
      'inadimplencia', CASE
        WHEN COALESCE(SUM(alunos_ativos), 0) > 0 THEN ROUND(SUM(alunos_nao_pagantes) / SUM(alunos_ativos) * 100, 2)
        ELSE 0
      END,
      'inadimplencia_pct', CASE
        WHEN COALESCE(SUM(alunos_ativos), 0) > 0 THEN ROUND(SUM(alunos_nao_pagantes) / SUM(alunos_ativos) * 100, 2)
        ELSE 0
      END
    ) AS patch
    FROM inadimplencia_por_unidade
  )
  SELECT
    COALESCE(gestao_patch.arr, COALESCE(v_result->'kpis_gestao', '[]'::jsonb)),
    COALESCE(dados_mes_patch.arr, COALESCE(v_result->'dados_mes_atual', '[]'::jsonb)),
    COALESCE(retencao_patch.arr, COALESCE(v_result->'kpis_retencao', '[]'::jsonb)),
    COALESCE(inadimplencia_totais.patch, '{}'::jsonb)
  INTO v_kpis_gestao_arr, v_dados_mes_atual_arr, v_kpis_retencao_arr, v_inadimplencia_totais
  FROM gestao_patch, dados_mes_patch, retencao_patch, inadimplencia_totais;

  v_result := jsonb_set(v_result, '{kpis_gestao}', COALESCE(v_kpis_gestao_arr, '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{dados_mes_atual}', COALESCE(v_dados_mes_atual_arr, '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{kpis_retencao}', COALESCE(v_kpis_retencao_arr, '[]'::jsonb), true);

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
    COALESCE(v_kpis_alunos->'totais', '{}'::jsonb) || COALESCE(v_inadimplencia_totais, '{}'::jsonb),
    true
  );
  v_result := jsonb_set(v_result, '{kpis_alunos_canonicos}', v_kpis_alunos, true);

  v_result := jsonb_set(
    v_result,
    '{kpis_inadimplencia_fonte}',
    to_jsonb('p19_alunos_nao_pagantes_sobre_ativos_admin'::text),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{kpis_renovacao_fonte}',
    to_jsonb('p19_movimentacoes_admin_retencao_canonica_sem_extras'::text),
    true
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) IS
  'P19: wrapper gerencial alinha inadimplencia e taxa de renovacao ao relatorio mensal administrativo canonico.';
