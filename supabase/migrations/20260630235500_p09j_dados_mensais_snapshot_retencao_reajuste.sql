-- ============================================================================
-- P09J - Compatibilidade dados_mensais: retencao/reajuste a partir do snapshot
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Contexto:
-- - O snapshot de relatorio_gerencial guarda alguns blocos como arrays com um
--   unico objeto, por exemplo kpis_retencao[0] e kpis_gestao[0].
-- - A P09F materializava dados_mensais sem ler esse dominio, fazendo
--   taxa_renovacao e reajuste_parcelas cair em fallback zero no dry-run.
--
-- Objetivo:
-- - Manter dados_mensais como tabela de compatibilidade historica.
-- - Ler taxa_renovacao de relatorio_gerencial.kpis_retencao[0].
-- - Ler reajuste de alunos_executivo/relarorio_gerencial sem zerar fallback.
--
-- Nao faz:
-- - Nao chama a funcao.
-- - Nao grava dados_mensais.
-- - Nao fecha competencia.
-- - Nao roda sync/backfill/recalculo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_dados_mensais_por_snapshot(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_unidade_id uuid;
  v_unidade_nome text;
  v_admin public.fechamento_mensal_snapshots%ROWTYPE;
  v_exec public.fechamento_mensal_snapshots%ROWTYPE;
  v_gerencial public.fechamento_mensal_snapshots%ROWTYPE;
  v_dm public.dados_mensais%ROWTYPE;
  v_linhas_previstas integer := 0;
  v_linhas_atualizadas integer := 0;
  v_result jsonb := '[]'::jsonb;
  v_valores jsonb;
  v_kpis_retencao jsonb := '{}'::jsonb;
  v_kpis_gestao jsonb := '{}'::jsonb;
  v_dados_mes_atual jsonb := '{}'::jsonb;
BEGIN
  IF p_ano IS NULL OR p_mes IS NULL OR p_mes < 1 OR p_mes > 12 THEN
    RAISE EXCEPTION 'Competencia invalida para compatibilidade dados_mensais: ano %, mes %', p_ano, p_mes;
  END IF;

  FOR v_unidade_id IN
    SELECT DISTINCT s.unidade_id
    FROM public.fechamento_mensal_snapshots s
    WHERE s.ano = p_ano
      AND s.mes = p_mes
      AND s.escopo = 'unidade'
      AND s.status IN ('aprovado', 'fechado')
      AND s.dominio IN ('alunos_admin', 'alunos_executivo')
      AND (p_unidade_id IS NULL OR s.unidade_id = p_unidade_id)
    ORDER BY s.unidade_id
  LOOP
    SELECT u.nome
    INTO v_unidade_nome
    FROM public.unidades u
    WHERE u.id = v_unidade_id;

    SELECT *
    INTO v_admin
    FROM public.fechamento_mensal_snapshots s
    WHERE s.ano = p_ano
      AND s.mes = p_mes
      AND s.escopo = 'unidade'
      AND s.unidade_id = v_unidade_id
      AND s.dominio = 'alunos_admin'
      AND s.status IN ('aprovado', 'fechado')
    ORDER BY s.versao DESC, s.aprovado_em DESC NULLS LAST, s.created_at DESC
    LIMIT 1;

    IF v_admin.id IS NULL THEN
      RAISE EXCEPTION 'Snapshot alunos_admin ausente para %/% unidade %.',
        p_mes, p_ano, COALESCE(v_unidade_nome, v_unidade_id::text);
    END IF;

    SELECT *
    INTO v_exec
    FROM public.fechamento_mensal_snapshots s
    WHERE s.ano = p_ano
      AND s.mes = p_mes
      AND s.escopo = 'unidade'
      AND s.unidade_id = v_unidade_id
      AND s.dominio = 'alunos_executivo'
      AND s.status IN ('aprovado', 'fechado')
    ORDER BY s.versao DESC, s.aprovado_em DESC NULLS LAST, s.created_at DESC
    LIMIT 1;

    IF v_exec.id IS NULL THEN
      RAISE EXCEPTION 'Snapshot alunos_executivo ausente para %/% unidade %.',
        p_mes, p_ano, COALESCE(v_unidade_nome, v_unidade_id::text);
    END IF;

    SELECT *
    INTO v_gerencial
    FROM public.fechamento_mensal_snapshots s
    WHERE s.ano = p_ano
      AND s.mes = p_mes
      AND s.escopo = 'unidade'
      AND s.unidade_id = v_unidade_id
      AND s.dominio = 'relatorio_gerencial'
      AND s.status IN ('aprovado', 'fechado')
    ORDER BY s.versao DESC, s.aprovado_em DESC NULLS LAST, s.created_at DESC
    LIMIT 1;

    IF v_gerencial.id IS NULL THEN
      RAISE EXCEPTION 'Snapshot relatorio_gerencial ausente para %/% unidade %.',
        p_mes, p_ano, COALESCE(v_unidade_nome, v_unidade_id::text);
    END IF;

    v_kpis_retencao := COALESCE(
      CASE
        WHEN jsonb_typeof(v_gerencial.payload->'kpis_retencao') = 'array'
          THEN v_gerencial.payload->'kpis_retencao'->0
        ELSE v_gerencial.payload->'kpis_retencao'
      END,
      '{}'::jsonb
    );

    v_kpis_gestao := COALESCE(
      CASE
        WHEN jsonb_typeof(v_gerencial.payload->'kpis_gestao') = 'array'
          THEN v_gerencial.payload->'kpis_gestao'->0
        ELSE v_gerencial.payload->'kpis_gestao'
      END,
      '{}'::jsonb
    );

    v_dados_mes_atual := COALESCE(
      CASE
        WHEN jsonb_typeof(v_gerencial.payload->'dados_mes_atual') = 'array'
          THEN v_gerencial.payload->'dados_mes_atual'->0
        ELSE v_gerencial.payload->'dados_mes_atual'
      END,
      '{}'::jsonb
    );

    SELECT *
    INTO v_dm
    FROM public.dados_mensais dm
    WHERE dm.ano = p_ano
      AND dm.mes = p_mes
      AND dm.unidade_id = v_unidade_id
    LIMIT 1;

    v_valores := jsonb_build_object(
      'alunos_ativos', COALESCE(NULLIF(v_admin.payload->>'alunos_ativos', '')::integer, NULLIF(v_exec.payload->>'alunos_ativos', '')::integer, v_dm.alunos_ativos, 0),
      'alunos_pagantes', COALESCE(NULLIF(v_exec.payload->>'alunos_pagantes', '')::integer, NULLIF(v_admin.payload->>'alunos_pagantes', '')::integer, v_dm.alunos_pagantes, 0),
      'novas_matriculas', COALESCE(NULLIF(v_admin.payload->>'novas_matriculas', '')::integer, NULLIF(v_exec.payload->>'novas_matriculas', '')::integer, v_dm.novas_matriculas, 0),
      'evasoes', COALESCE(NULLIF(v_exec.payload->>'evasoes', '')::integer, NULLIF(v_admin.payload->>'evasoes', '')::integer, v_dm.evasoes, 0),
      'churn_rate', COALESCE(NULLIF(v_exec.payload->>'churn_rate', '')::numeric, NULLIF(v_kpis_retencao->>'taxa_evasao', '')::numeric, NULLIF(v_kpis_gestao->>'churn_rate', '')::numeric, v_dm.churn_rate, 0),
      'ticket_medio', COALESCE(NULLIF(v_exec.payload->>'ticket_medio', '')::numeric, NULLIF(v_kpis_gestao->>'ticket_medio', '')::numeric, v_dm.ticket_medio, 0),
      'taxa_renovacao', COALESCE(NULLIF(v_exec.payload->>'taxa_renovacao', '')::numeric, NULLIF(v_kpis_retencao->>'taxa_renovacao', '')::numeric, v_dm.taxa_renovacao, 0),
      'tempo_permanencia', COALESCE(NULLIF(v_exec.payload->>'tempo_permanencia', '')::numeric, NULLIF(v_kpis_gestao->>'tempo_permanencia', '')::numeric, v_dm.tempo_permanencia, 0),
      'inadimplencia', COALESCE(NULLIF(v_exec.payload->>'inadimplencia', '')::numeric, NULLIF(v_exec.payload->>'inadimplencia_pct', '')::numeric, NULLIF(v_kpis_gestao->>'inadimplencia', '')::numeric, NULLIF(v_kpis_gestao->>'inadimplencia_pct', '')::numeric, v_dm.inadimplencia, 0),
      'reajuste_parcelas', COALESCE(NULLIF(v_exec.payload->>'reajuste_parcelas', '')::numeric, NULLIF(v_exec.payload->>'reajuste_medio', '')::numeric, NULLIF(v_exec.payload->>'reajuste_pct', '')::numeric, NULLIF(v_kpis_gestao->>'reajuste_parcelas', '')::numeric, NULLIF(v_kpis_gestao->>'reajuste_medio', '')::numeric, NULLIF(v_kpis_gestao->>'reajuste_pct', '')::numeric, NULLIF(v_dados_mes_atual->>'reajuste_medio', '')::numeric, NULLIF(v_dados_mes_atual->>'reajuste_pct', '')::numeric, v_dm.reajuste_parcelas, 0),
      'faturamento_estimado', COALESCE(NULLIF(v_exec.payload->>'faturamento_estimado', '')::numeric, NULLIF(v_exec.payload->>'mrr', '')::numeric, NULLIF(v_kpis_gestao->>'mrr', '')::numeric, v_dm.faturamento_estimado, 0),
      'saldo_liquido', COALESCE(NULLIF(v_exec.payload->>'saldo_liquido', '')::integer, NULLIF(v_kpis_gestao->>'saldo_liquido', '')::integer, v_dm.saldo_liquido, 0),
      'ticket_medio_passaporte', COALESCE(NULLIF(v_exec.payload->>'ticket_medio_passaporte', '')::numeric, v_dm.ticket_medio_passaporte, 0),
      'faturamento_passaporte', COALESCE(NULLIF(v_exec.payload->>'faturamento_passaporte', '')::numeric, v_dm.faturamento_passaporte, 0),
      'matriculas_ativas', COALESCE(NULLIF(v_admin.payload->>'matriculas_ativas', '')::integer, NULLIF(v_exec.payload->>'matriculas_ativas', '')::integer, v_dm.matriculas_ativas, 0),
      'matriculas_banda', COALESCE(NULLIF(v_admin.payload->>'matriculas_banda', '')::integer, NULLIF(v_exec.payload->>'matriculas_banda', '')::integer, v_dm.matriculas_banda, 0),
      'matriculas_2_curso', COALESCE(NULLIF(v_admin.payload->>'matriculas_2_curso', '')::integer, NULLIF(v_exec.payload->>'matriculas_2_curso', '')::integer, v_dm.matriculas_2_curso, 0),
      'bolsistas_integrais', COALESCE(NULLIF(v_admin.payload->>'bolsistas_integrais', '')::integer, NULLIF(v_exec.payload->>'bolsistas_integrais', '')::integer, v_dm.bolsistas_integrais, 0),
      'bolsistas_parciais', COALESCE(NULLIF(v_admin.payload->>'bolsistas_parciais', '')::integer, NULLIF(v_exec.payload->>'bolsistas_parciais', '')::integer, v_dm.bolsistas_parciais, 0)
    );

    v_linhas_previstas := v_linhas_previstas + 1;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'unidade_id', v_unidade_id,
      'unidade_nome', v_unidade_nome,
      'dry_run', p_dry_run,
      'snapshot_alunos_admin_id', v_admin.id,
      'snapshot_alunos_executivo_id', v_exec.id,
      'snapshot_relatorio_gerencial_id', v_gerencial.id,
      'valores', v_valores
    ));

    IF NOT p_dry_run THEN
      INSERT INTO public.dados_mensais (
        unidade_id,
        ano,
        mes,
        alunos_pagantes,
        novas_matriculas,
        evasoes,
        churn_rate,
        ticket_medio,
        taxa_renovacao,
        tempo_permanencia,
        inadimplencia,
        reajuste_parcelas,
        faturamento_estimado,
        saldo_liquido,
        updated_at,
        ticket_medio_passaporte,
        faturamento_passaporte,
        alunos_ativos,
        matriculas_ativas,
        matriculas_banda,
        matriculas_2_curso,
        bolsistas_integrais,
        bolsistas_parciais
      )
      VALUES (
        v_unidade_id,
        p_ano,
        p_mes,
        (v_valores->>'alunos_pagantes')::integer,
        (v_valores->>'novas_matriculas')::integer,
        (v_valores->>'evasoes')::integer,
        (v_valores->>'churn_rate')::numeric,
        (v_valores->>'ticket_medio')::numeric,
        (v_valores->>'taxa_renovacao')::numeric,
        (v_valores->>'tempo_permanencia')::numeric,
        (v_valores->>'inadimplencia')::numeric,
        (v_valores->>'reajuste_parcelas')::numeric,
        (v_valores->>'faturamento_estimado')::numeric,
        (v_valores->>'saldo_liquido')::integer,
        now(),
        (v_valores->>'ticket_medio_passaporte')::numeric,
        (v_valores->>'faturamento_passaporte')::numeric,
        (v_valores->>'alunos_ativos')::integer,
        (v_valores->>'matriculas_ativas')::integer,
        (v_valores->>'matriculas_banda')::integer,
        (v_valores->>'matriculas_2_curso')::integer,
        (v_valores->>'bolsistas_integrais')::integer,
        (v_valores->>'bolsistas_parciais')::integer
      )
      ON CONFLICT (unidade_id, ano, mes)
      DO UPDATE SET
        alunos_pagantes = EXCLUDED.alunos_pagantes,
        novas_matriculas = EXCLUDED.novas_matriculas,
        evasoes = EXCLUDED.evasoes,
        churn_rate = EXCLUDED.churn_rate,
        ticket_medio = EXCLUDED.ticket_medio,
        taxa_renovacao = EXCLUDED.taxa_renovacao,
        tempo_permanencia = EXCLUDED.tempo_permanencia,
        inadimplencia = EXCLUDED.inadimplencia,
        reajuste_parcelas = EXCLUDED.reajuste_parcelas,
        faturamento_estimado = EXCLUDED.faturamento_estimado,
        saldo_liquido = EXCLUDED.saldo_liquido,
        updated_at = now(),
        ticket_medio_passaporte = EXCLUDED.ticket_medio_passaporte,
        faturamento_passaporte = EXCLUDED.faturamento_passaporte,
        alunos_ativos = EXCLUDED.alunos_ativos,
        matriculas_ativas = EXCLUDED.matriculas_ativas,
        matriculas_banda = EXCLUDED.matriculas_banda,
        matriculas_2_curso = EXCLUDED.matriculas_2_curso,
        bolsistas_integrais = EXCLUDED.bolsistas_integrais,
        bolsistas_parciais = EXCLUDED.bolsistas_parciais;

      INSERT INTO public.fechamento_mensal_auditoria (
        snapshot_id,
        ano,
        mes,
        escopo,
        unidade_id,
        acao,
        detalhes,
        actor_id
      )
      VALUES (
        v_exec.id,
        p_ano,
        p_mes,
        'unidade',
        v_unidade_id,
        'compatibilidade_dados_mensais_atualizada',
        jsonb_build_object(
          'fonte_admin_snapshot_id', v_admin.id,
          'fonte_executivo_snapshot_id', v_exec.id,
          'fonte_relatorio_gerencial_snapshot_id', v_gerencial.id,
          'valores', v_valores
        ),
        auth.uid()
      );

      v_linhas_atualizadas := v_linhas_atualizadas + 1;
    END IF;
  END LOOP;

  IF v_linhas_previstas = 0 THEN
    RAISE EXCEPTION 'Nenhum snapshot aprovado/fechado encontrado para %/% com os filtros informados.',
      p_mes, p_ano;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'linhas_previstas', v_linhas_previstas,
    'linhas_atualizadas', v_linhas_atualizadas,
    'unidades', v_result
  );
END;
$function$;

COMMENT ON FUNCTION public.atualizar_dados_mensais_por_snapshot(integer, integer, uuid, boolean) IS
  'Atualiza dados_mensais de compatibilidade usando snapshots aprovados/fechados, incluindo retencao e reajuste do relatorio gerencial. Dry-run por padrao; restrita a service_role.';

REVOKE ALL ON FUNCTION public.atualizar_dados_mensais_por_snapshot(integer, integer, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_dados_mensais_por_snapshot(integer, integer, uuid, boolean)
  TO service_role;
