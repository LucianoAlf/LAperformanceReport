-- ============================================
-- Migration: Corrigir RPC canônica de KPIs de alunos para excluir atividades extras em evasões/churn vivo
-- Contexto: Dashboard usa get_kpis_alunos_canonicos -> base_p01q para card Evasões do mês.
-- Segurança: não altera dados. Apenas redefine função existente com filtro em evasoes_live.
-- ============================================

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_canonicos_base_p01q(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_inicio_mes date := make_date(p_ano, p_mes, 1);
  v_fim_mes date := (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  v_data_corte date;
  v_mes_atual boolean;
  v_result jsonb;
BEGIN
  v_data_corte := LEAST(v_hoje, v_fim_mes);
  v_mes_atual := p_ano = EXTRACT(year FROM v_hoje)::integer
              AND p_mes = EXTRACT(month FROM v_hoje)::integer;

  WITH unidades_base AS (
    SELECT u.id AS unidade_id, u.nome::text AS unidade_nome
    FROM public.unidades u
    WHERE u.ativo = true
      AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
  ),
  competencias AS (
    SELECT
      ub.unidade_id,
      ub.unidade_nome,
      COALESCE(cm.status, 'aberto') AS status_competencia,
      cm.fechamento_lote_id,
      cm.fechado_em,
      cm.status IN ('fechado', 'retificacao_pendente') AS competencia_bloqueada
    FROM unidades_base ub
    LEFT JOIN public.competencias_mensais cm
      ON cm.unidade_id = ub.unidade_id
     AND cm.ano = p_ano
     AND cm.mes = p_mes
  ),
  alunos_base AS (
    SELECT
      a.id,
      a.nome,
      a.idade_atual,
      a.status,
      a.data_matricula,
      a.data_saida,
      a.unidade_id,
      COALESCE(a.valor_parcela, 0)::numeric AS valor_parcela,
      COALESCE(a.is_segundo_curso, false) AS is_segundo_curso,
      c.nome::text AS curso_nome,
      COALESCE(c.is_projeto_banda, false) AS is_banda,
      (LOWER(COALESCE(c.nome, '')) LIKE '%canto coral%') AS is_coral,
      tm.codigo::text AS tipo_codigo,
      COALESCE(tm.entra_ticket_medio, false) AS entra_ticket_medio,
      COALESCE(tm.conta_como_pagante, false) AS conta_como_pagante,
      CASE
        WHEN btrim(COALESCE(a.nome, '')) <> ''
          THEN lower(btrim(a.nome)) || '|' || a.unidade_id::text
        ELSE NULL
      END AS pessoa_key
    FROM public.alunos a
    JOIN unidades_base ub ON ub.unidade_id = a.unidade_id
    LEFT JOIN public.cursos c ON c.id = a.curso_id
    LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.arquivado_em IS NULL
      AND a.status IN ('ativo', 'trancado')
      AND (a.data_matricula IS NULL OR a.data_matricula <= v_data_corte)
      AND (a.data_saida IS NULL OR a.data_saida > v_data_corte)
  ),
  pessoas_live AS (
    SELECT
      ab.unidade_id,
      ab.pessoa_key,
      MAX(ab.idade_atual) FILTER (WHERE ab.idade_atual IS NOT NULL) AS idade,
      COALESCE(SUM(
        CASE
          WHEN ab.entra_ticket_medio = true AND ab.valor_parcela > 0
            THEN ab.valor_parcela
          ELSE 0
        END
      ), 0)::numeric AS mrr,
      BOOL_OR(ab.tipo_codigo = 'BOLSISTA_INT' AND ab.is_banda = false) AS bolsista_integral,
      BOOL_OR(ab.tipo_codigo = 'BOLSISTA_PARC' AND ab.is_banda = false) AS bolsista_parcial,
      BOOL_OR(ab.status = 'trancado') AS trancado
    FROM alunos_base ab
    WHERE ab.pessoa_key IS NOT NULL
    GROUP BY ab.unidade_id, ab.pessoa_key
  ),
  pessoas_metricas_live AS (
    SELECT
      ub.unidade_id,
      COUNT(pl.pessoa_key)::integer AS alunos_ativos,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.mrr > 0)::integer AS alunos_pagantes,
      COALESCE(SUM(pl.mrr), 0)::numeric AS mrr,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.bolsista_integral = true)::integer AS bolsistas_integrais,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.bolsista_parcial = true)::integer AS bolsistas_parciais,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.idade IS NOT NULL AND pl.idade <= 11)::integer AS alunos_kids,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.idade IS NOT NULL AND pl.idade >= 12)::integer AS alunos_school,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.idade IS NULL)::integer AS alunos_sem_classificacao,
      COUNT(pl.pessoa_key) FILTER (WHERE pl.trancado = true)::integer AS alunos_trancados
    FROM unidades_base ub
    LEFT JOIN pessoas_live pl ON pl.unidade_id = ub.unidade_id
    GROUP BY ub.unidade_id
  ),
  matriculas_metricas_live AS (
    SELECT
      ub.unidade_id,
      COUNT(ab.id)::integer AS matriculas_ativas,
      COUNT(ab.id) FILTER (WHERE ab.is_banda = true)::integer AS matriculas_banda,
      COUNT(ab.id) FILTER (
        WHERE ab.is_segundo_curso = true
          AND ab.is_banda = false
          AND ab.is_coral = false
      )::integer AS matriculas_2_curso,
      COUNT(ab.id) FILTER (WHERE ab.is_coral = true)::integer AS matriculas_coral,
      COUNT(DISTINCT ab.pessoa_key) FILTER (
        WHERE ab.data_matricula >= v_inicio_mes
          AND ab.data_matricula <= v_data_corte
          AND ab.is_segundo_curso = false
          AND ab.is_banda = false
          AND ab.is_coral = false
          AND ab.tipo_codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC')
          AND (ab.conta_como_pagante = true OR ab.entra_ticket_medio = true)
          AND ab.valor_parcela > 0
      )::integer AS novas_matriculas
    FROM unidades_base ub
    LEFT JOIN alunos_base ab ON ab.unidade_id = ub.unidade_id
    GROUP BY ub.unidade_id
  ),
  evasoes_live AS (
    SELECT
      ub.unidade_id,
      COUNT(DISTINCT COALESCE(
        'id:' || ma.aluno_id::text,
        'nome:' || lower(btrim(ma.aluno_nome)) || '|' || ma.unidade_id::text
      )) FILTER (
        WHERE ma.id IS NOT NULL
          AND NOT public.is_atividade_extra_curso(COALESCE(ma.curso_id, aluno_mov.curso_id))
      )::integer AS evasoes
    FROM unidades_base ub
    LEFT JOIN public.movimentacoes_admin ma
      ON ma.unidade_id = ub.unidade_id
     AND ma.tipo IN ('evasao', 'nao_renovacao')
     AND ma.data >= v_inicio_mes
     AND ma.data <= v_data_corte
    LEFT JOIN public.alunos aluno_mov ON aluno_mov.id = ma.aluno_id
    GROUP BY ub.unidade_id
  ),
  live_unidade AS (
    SELECT
      ub.unidade_id,
      COALESCE(pml.alunos_ativos, 0) AS alunos_ativos,
      COALESCE(pml.alunos_pagantes, 0) AS alunos_pagantes,
      COALESCE(pml.mrr, 0) AS mrr,
      CASE
        WHEN COALESCE(pml.alunos_pagantes, 0) > 0
          THEN ROUND(COALESCE(pml.mrr, 0) / pml.alunos_pagantes, 2)
        ELSE 0
      END AS ticket_medio,
      COALESCE(pml.bolsistas_integrais, 0) AS bolsistas_integrais,
      COALESCE(pml.bolsistas_parciais, 0) AS bolsistas_parciais,
      COALESCE(pml.alunos_kids, 0) AS alunos_kids,
      COALESCE(pml.alunos_school, 0) AS alunos_school,
      COALESCE(pml.alunos_sem_classificacao, 0) AS alunos_sem_classificacao,
      COALESCE(pml.alunos_trancados, 0) AS alunos_trancados,
      COALESCE(mml.matriculas_ativas, 0) AS matriculas_ativas,
      COALESCE(mml.matriculas_banda, 0) AS matriculas_banda,
      COALESCE(mml.matriculas_2_curso, 0) AS matriculas_2_curso,
      COALESCE(mml.matriculas_coral, 0) AS matriculas_coral,
      COALESCE(mml.novas_matriculas, 0) AS novas_matriculas,
      COALESCE(el.evasoes, 0) AS evasoes
    FROM unidades_base ub
    LEFT JOIN pessoas_metricas_live pml ON pml.unidade_id = ub.unidade_id
    LEFT JOIN matriculas_metricas_live mml ON mml.unidade_id = ub.unidade_id
    LEFT JOIN evasoes_live el ON el.unidade_id = ub.unidade_id
  ),
  snapshot AS (
    SELECT
      dm.unidade_id,
      dm.alunos_ativos,
      dm.alunos_pagantes,
      dm.ticket_medio,
      dm.faturamento_estimado AS mrr,
      dm.novas_matriculas,
      dm.evasoes,
      dm.churn_rate,
      dm.inadimplencia,
      dm.tempo_permanencia,
      dm.reajuste_parcelas,
      dm.saldo_liquido,
      dm.matriculas_ativas,
      dm.matriculas_banda,
      dm.matriculas_2_curso,
      dm.bolsistas_integrais,
      dm.bolsistas_parciais
    FROM public.dados_mensais dm
    JOIN unidades_base ub ON ub.unidade_id = dm.unidade_id
    WHERE dm.ano = p_ano
      AND dm.mes = p_mes
  ),
  raw_final AS (
    SELECT
      c.unidade_id,
      c.unidade_nome,
      c.status_competencia,
      c.fechamento_lote_id,
      c.fechado_em,
      c.competencia_bloqueada,
      s.unidade_id IS NOT NULL AS tem_snapshot,
      CASE
        WHEN c.competencia_bloqueada = true AND s.unidade_id IS NOT NULL THEN 'dados_mensais'
        WHEN c.competencia_bloqueada = true AND s.unidade_id IS NULL THEN 'indisponivel'
        WHEN v_mes_atual = true THEN 'vivo'
        WHEN s.unidade_id IS NOT NULL THEN 'preliminar'
        ELSE 'indisponivel'
      END AS fonte,
      s.alunos_ativos AS snap_alunos_ativos,
      s.alunos_pagantes AS snap_alunos_pagantes,
      s.ticket_medio AS snap_ticket_medio,
      s.mrr AS snap_mrr,
      s.novas_matriculas AS snap_novas_matriculas,
      s.evasoes AS snap_evasoes,
      s.churn_rate AS snap_churn_rate,
      s.inadimplencia AS snap_inadimplencia,
      s.tempo_permanencia AS snap_tempo_permanencia,
      s.reajuste_parcelas AS snap_reajuste_parcelas,
      s.saldo_liquido AS snap_saldo_liquido,
      s.matriculas_ativas AS snap_matriculas_ativas,
      s.matriculas_banda AS snap_matriculas_banda,
      s.matriculas_2_curso AS snap_matriculas_2_curso,
      s.bolsistas_integrais AS snap_bolsistas_integrais,
      s.bolsistas_parciais AS snap_bolsistas_parciais,
      l.alunos_ativos AS live_alunos_ativos,
      l.alunos_pagantes AS live_alunos_pagantes,
      l.ticket_medio AS live_ticket_medio,
      l.mrr AS live_mrr,
      l.novas_matriculas AS live_novas_matriculas,
      l.evasoes AS live_evasoes,
      l.bolsistas_integrais AS live_bolsistas_integrais,
      l.bolsistas_parciais AS live_bolsistas_parciais,
      l.alunos_kids AS live_alunos_kids,
      l.alunos_school AS live_alunos_school,
      l.alunos_sem_classificacao AS live_alunos_sem_classificacao,
      l.alunos_trancados AS live_alunos_trancados,
      l.matriculas_ativas AS live_matriculas_ativas,
      l.matriculas_banda AS live_matriculas_banda,
      l.matriculas_2_curso AS live_matriculas_2_curso,
      l.matriculas_coral AS live_matriculas_coral
    FROM competencias c
    LEFT JOIN snapshot s ON s.unidade_id = c.unidade_id
    LEFT JOIN live_unidade l ON l.unidade_id = c.unidade_id
  ),
  final_rows AS (
    SELECT
      rf.unidade_id,
      rf.unidade_nome,
      rf.status_competencia,
      rf.fechamento_lote_id,
      rf.fechado_em,
      rf.competencia_bloqueada,
      rf.tem_snapshot,
      rf.fonte,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_alunos_ativos, 0) ELSE COALESCE(rf.live_alunos_ativos, 0) END::integer AS alunos_ativos,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_alunos_pagantes, 0) ELSE COALESCE(rf.live_alunos_pagantes, 0) END::integer AS alunos_pagantes,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_ticket_medio, 0) ELSE COALESCE(rf.live_ticket_medio, 0) END::numeric AS ticket_medio,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_mrr, 0) ELSE COALESCE(rf.live_mrr, 0) END::numeric AS mrr,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_novas_matriculas, 0) ELSE COALESCE(rf.live_novas_matriculas, 0) END::integer AS novas_matriculas,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_evasoes, 0) ELSE COALESCE(rf.live_evasoes, 0) END::integer AS evasoes,
      CASE
        WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_churn_rate, 0)
        WHEN COALESCE(rf.live_alunos_pagantes, 0) > 0 THEN ROUND(COALESCE(rf.live_evasoes, 0)::numeric / rf.live_alunos_pagantes * 100, 2)
        ELSE 0
      END::numeric AS churn_rate,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_inadimplencia, 0) ELSE 0 END::numeric AS inadimplencia,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_tempo_permanencia, 0) ELSE 0 END::numeric AS tempo_permanencia,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_reajuste_parcelas, 0) ELSE 0 END::numeric AS reajuste_pct,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_matriculas_ativas, 0) ELSE COALESCE(rf.live_matriculas_ativas, 0) END::integer AS matriculas_ativas,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_matriculas_banda, 0) ELSE COALESCE(rf.live_matriculas_banda, 0) END::integer AS matriculas_banda,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_matriculas_2_curso, 0) ELSE COALESCE(rf.live_matriculas_2_curso, 0) END::integer AS matriculas_2_curso,
      CASE WHEN rf.fonte = 'vivo' THEN COALESCE(rf.live_matriculas_coral, 0) ELSE 0 END::integer AS matriculas_coral,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_bolsistas_integrais, 0) ELSE COALESCE(rf.live_bolsistas_integrais, 0) END::integer AS bolsistas_integrais,
      CASE WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_bolsistas_parciais, 0) ELSE COALESCE(rf.live_bolsistas_parciais, 0) END::integer AS bolsistas_parciais,
      CASE WHEN rf.fonte = 'vivo' THEN rf.live_alunos_kids ELSE NULL END::integer AS alunos_kids,
      CASE WHEN rf.fonte = 'vivo' THEN rf.live_alunos_school ELSE NULL END::integer AS alunos_school,
      CASE WHEN rf.fonte = 'vivo' THEN rf.live_alunos_sem_classificacao ELSE NULL END::integer AS alunos_sem_classificacao,
      CASE WHEN rf.fonte = 'vivo' THEN rf.live_alunos_trancados ELSE 0 END::integer AS alunos_trancados,
      CASE
        WHEN rf.fonte IN ('dados_mensais', 'preliminar') THEN COALESCE(rf.snap_saldo_liquido, COALESCE(rf.snap_novas_matriculas, 0) - COALESCE(rf.snap_evasoes, 0))
        ELSE COALESCE(rf.live_novas_matriculas, 0) - COALESCE(rf.live_evasoes, 0)
      END::integer AS saldo_liquido
    FROM raw_final rf
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'inicio_mes', v_inicio_mes,
      'fim_mes', v_fim_mes,
      'data_corte', v_data_corte,
      'unidade_id', p_unidade_id
    ),
    'fonte', CASE
      WHEN COUNT(*) = 0 THEN 'indisponivel'
      WHEN COUNT(DISTINCT fr.fonte) = 1 THEN MIN(fr.fonte)
      ELSE 'misto'
    END,
    'competencia_fechada', COALESCE(BOOL_AND(fr.competencia_bloqueada), false),
    'competencia_parcial', COALESCE(BOOL_OR(fr.competencia_bloqueada), false)
                          AND COALESCE(BOOL_OR(NOT fr.competencia_bloqueada), false),
    'alertas_fonte', CASE
      WHEN COUNT(*) = 0 THEN jsonb_build_array('Nenhuma unidade encontrada para o filtro.')
      WHEN BOOL_OR(fr.fonte = 'indisponivel') THEN jsonb_build_array('Ha unidade sem snapshot e fora do mes atual; nao houve recalculo silencioso.')
      WHEN BOOL_OR(fr.fonte = 'preliminar') THEN jsonb_build_array('Competencia aberta com snapshot existente; tratar como preliminar ate fechamento formal.')
      WHEN BOOL_OR(fr.fonte = 'vivo') THEN jsonb_build_array('Mes atual aberto: calculo vivo canonico direto de alunos/movimentacoes.')
      ELSE jsonb_build_array('Competencia fechada: leitura de dados_mensais.')
    END,
    'totais', jsonb_build_object(
      'alunos_ativos', COALESCE(SUM(fr.alunos_ativos), 0),
      'total_alunos_ativos', COALESCE(SUM(fr.alunos_ativos), 0),
      'alunos_pagantes', COALESCE(SUM(fr.alunos_pagantes), 0),
      'total_alunos_pagantes', COALESCE(SUM(fr.alunos_pagantes), 0),
      'alunos_nao_pagantes', COALESCE(SUM(fr.alunos_ativos - fr.alunos_pagantes), 0),
      'ticket_medio', CASE WHEN COALESCE(SUM(fr.alunos_pagantes), 0) > 0 THEN ROUND(COALESCE(SUM(fr.mrr), 0) / SUM(fr.alunos_pagantes), 2) ELSE 0 END,
      'mrr', COALESCE(SUM(fr.mrr), 0),
      'arr', COALESCE(SUM(fr.mrr), 0) * 12,
      'faturamento_previsto', COALESCE(SUM(fr.mrr), 0),
      'faturamento_realizado', COALESCE(SUM(fr.mrr), 0),
      'evasoes', COALESCE(SUM(fr.evasoes), 0),
      'total_evasoes', COALESCE(SUM(fr.evasoes), 0),
      'churn_rate', CASE WHEN COALESCE(SUM(fr.alunos_pagantes), 0) > 0 THEN ROUND(COALESCE(SUM(fr.evasoes), 0)::numeric / SUM(fr.alunos_pagantes) * 100, 2) ELSE 0 END,
      'inadimplencia', COALESCE(AVG(fr.inadimplencia), 0),
      'inadimplencia_pct', COALESCE(AVG(fr.inadimplencia), 0),
      'tempo_permanencia', COALESCE(AVG(fr.tempo_permanencia), 0),
      'tempo_permanencia_medio', COALESCE(AVG(fr.tempo_permanencia), 0),
      'ltv_medio', CASE WHEN COALESCE(SUM(fr.alunos_pagantes), 0) > 0 THEN ROUND(COALESCE(SUM(fr.mrr), 0) / SUM(fr.alunos_pagantes), 2) * COALESCE(AVG(fr.tempo_permanencia), 0) ELSE 0 END,
      'novas_matriculas', COALESCE(SUM(fr.novas_matriculas), 0),
      'saldo_liquido', COALESCE(SUM(fr.saldo_liquido), 0),
      'matriculas_ativas', COALESCE(SUM(fr.matriculas_ativas), 0),
      'matriculas_banda', COALESCE(SUM(fr.matriculas_banda), 0),
      'matriculas_2_curso', COALESCE(SUM(fr.matriculas_2_curso), 0),
      'matriculas_coral', COALESCE(SUM(fr.matriculas_coral), 0),
      'bolsistas_integrais', COALESCE(SUM(fr.bolsistas_integrais), 0),
      'bolsistas_parciais', COALESCE(SUM(fr.bolsistas_parciais), 0),
      'total_bolsistas_integrais', COALESCE(SUM(fr.bolsistas_integrais), 0),
      'total_bolsistas_parciais', COALESCE(SUM(fr.bolsistas_parciais), 0),
      'alunos_kids', SUM(fr.alunos_kids),
      'alunos_school', SUM(fr.alunos_school),
      'alunos_sem_classificacao', SUM(fr.alunos_sem_classificacao)
    ),
    'por_unidade', COALESCE(jsonb_agg(jsonb_build_object(
      'unidade_id', fr.unidade_id,
      'unidade_nome', fr.unidade_nome,
      'ano', p_ano,
      'mes', p_mes,
      'fonte', fr.fonte,
      'status_competencia', fr.status_competencia,
      'fechamento_lote_id', fr.fechamento_lote_id,
      'competencia_fechada', fr.competencia_bloqueada,
      'tem_snapshot', fr.tem_snapshot,
      'alunos_ativos', fr.alunos_ativos,
      'total_alunos_ativos', fr.alunos_ativos,
      'alunos_pagantes', fr.alunos_pagantes,
      'total_alunos_pagantes', fr.alunos_pagantes,
      'alunos_nao_pagantes', fr.alunos_ativos - fr.alunos_pagantes,
      'ticket_medio', fr.ticket_medio,
      'mrr', fr.mrr,
      'arr', fr.mrr * 12,
      'faturamento_previsto', fr.mrr,
      'faturamento_realizado', fr.mrr,
      'novas_matriculas', fr.novas_matriculas,
      'evasoes', fr.evasoes,
      'total_evasoes', fr.evasoes,
      'churn_rate', fr.churn_rate,
      'inadimplencia', fr.inadimplencia,
      'inadimplencia_pct', fr.inadimplencia,
      'tempo_permanencia', fr.tempo_permanencia,
      'tempo_permanencia_medio', fr.tempo_permanencia,
      'ltv_medio', fr.ticket_medio * fr.tempo_permanencia,
      'reajuste_pct', fr.reajuste_pct,
      'reajuste_medio', fr.reajuste_pct,
      'saldo_liquido', fr.saldo_liquido,
      'matriculas_ativas', fr.matriculas_ativas,
      'matriculas_banda', fr.matriculas_banda,
      'matriculas_2_curso', fr.matriculas_2_curso,
      'matriculas_coral', fr.matriculas_coral,
      'bolsistas_integrais', fr.bolsistas_integrais,
      'bolsistas_parciais', fr.bolsistas_parciais,
      'total_bolsistas_integrais', fr.bolsistas_integrais,
      'total_bolsistas_parciais', fr.bolsistas_parciais,
      'alunos_kids', fr.alunos_kids,
      'alunos_school', fr.alunos_school,
      'alunos_sem_classificacao', fr.alunos_sem_classificacao,
      'alunos_trancados', fr.alunos_trancados,
      'segmentacao_kids_school_fonte', CASE
        WHEN fr.fonte = 'vivo' THEN 'vivo_idade_atual'
        ELSE 'indisponivel_snapshot_sem_colunas'
      END
    ) ORDER BY fr.unidade_nome), '[]'::jsonb)
  )
  INTO v_result
  FROM final_rows fr;

  RETURN v_result;
END;
$function$;


COMMENT ON FUNCTION public.get_kpis_alunos_canonicos_base_p01q(uuid, integer, integer)
IS 'P0.1Q base: KPIs canônicos de alunos com evasoes_live excluindo atividades extras via is_atividade_extra_curso(COALESCE(movimentacoes_admin.curso_id, alunos.curso_id)).';
