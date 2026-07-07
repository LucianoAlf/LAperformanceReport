-- ============================================================================
-- P14 - Retificacao controlada Barra Junho/2026 para relatorio gerencial
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Contexto operacional validado pelo relatorio mensal administrativo:
-- - O relatorio mensal administrativo de Barra/Junho e o gabarito canonico.
-- - O relatorio gerencial continuava lendo snapshot antigo/retificado parcial:
--   238 ativos, 236 pagantes, ticket 451.58, churn 1.69 e MRR perdido 1361.
-- - Esta migracao retifica somente Barra Jun/2026, sem sync Emusys e sem
--   alterar outras unidades.
-- ============================================================================

DO $$
DECLARE
  v_barra uuid;
  v_admin_snapshot_id uuid;
  v_exec_snapshot_id uuid;
  v_gerencial_snapshot_id uuid;
  v_admin_old jsonb;
  v_exec_old jsonb;
  v_gerencial_old jsonb;
  v_admin_new jsonb;
  v_exec_new jsonb;
  v_gerencial_new jsonb;
  v_kpis_gestao_old jsonb := '{}'::jsonb;
  v_kpis_retencao_old jsonb := '{}'::jsonb;
  v_kpis_gestao_new jsonb;
  v_kpis_retencao_new jsonb;
  v_dm_old jsonb;
  v_dm_after jsonb;

  v_alunos_ativos integer := 240;
  v_alunos_pagantes integer := 238;
  v_alunos_nao_pagantes integer := 2;
  v_bolsistas_integrais integer := 1;
  v_bolsistas_parciais integer := 1;
  v_alunos_trancados integer := 5;
  v_novas_matriculas integer := 15;
  v_transferencias_recebidas integer := 1;
  v_entradas_administrativas integer := 16;

  v_matriculas_ativas integer := 265;
  v_matriculas_base integer := 239;
  v_matriculas_banda integer := 12;
  v_matriculas_2_curso integer := 14;
  v_alunos_com_2_curso integer := 14;
  v_matriculas_2_curso_extras integer := 0;

  v_ticket_medio numeric := 446.12;
  v_faturamento_previsto numeric := 106572.88;
  v_mrr_atual numeric := 96650.30;
  v_ltv_medio numeric := 5809.52;
  v_tempo_permanencia numeric := 13.02;
  v_churn_rate numeric := 1.26;
  v_taxa_renovacao numeric := 100.0;
  v_reajuste_medio numeric := 10.58;
  v_inadimplencia numeric := 0.8;
  v_mrr_perdido numeric := 1181.00;

  v_evasoes_base integer := 3;
  v_evasoes_bolsista integer := 1;
  v_total_evasoes integer := 4;
  v_total_evasoes_label text := '3+1 bolsista';
BEGIN
  SELECT id INTO v_barra
  FROM public.unidades
  WHERE lower(nome) = 'barra'
  LIMIT 1;

  IF v_barra IS NULL THEN
    RAISE EXCEPTION 'P14: unidade Barra nao encontrada.';
  END IF;

  SELECT id, payload INTO v_admin_snapshot_id, v_admin_old
  FROM public.fechamento_mensal_snapshots
  WHERE ano = 2026
    AND mes = 6
    AND escopo = 'unidade'
    AND unidade_id = v_barra
    AND dominio = 'alunos_admin'
    AND status IN ('aprovado', 'fechado')
  ORDER BY versao DESC, aprovado_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  SELECT id, payload INTO v_exec_snapshot_id, v_exec_old
  FROM public.fechamento_mensal_snapshots
  WHERE ano = 2026
    AND mes = 6
    AND escopo = 'unidade'
    AND unidade_id = v_barra
    AND dominio = 'alunos_executivo'
    AND status IN ('aprovado', 'fechado')
  ORDER BY versao DESC, aprovado_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  SELECT id, payload INTO v_gerencial_snapshot_id, v_gerencial_old
  FROM public.fechamento_mensal_snapshots
  WHERE ano = 2026
    AND mes = 6
    AND escopo = 'unidade'
    AND unidade_id = v_barra
    AND dominio = 'relatorio_gerencial'
    AND status IN ('aprovado', 'fechado')
  ORDER BY versao DESC, aprovado_em DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_admin_snapshot_id IS NULL OR v_exec_snapshot_id IS NULL OR v_gerencial_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'P14: snapshots alunos_admin/alunos_executivo/relatorio_gerencial ausentes para Barra Jun/2026.';
  END IF;

  SELECT to_jsonb(dm.*) INTO v_dm_old
  FROM public.dados_mensais dm
  WHERE dm.unidade_id = v_barra
    AND dm.ano = 2026
    AND dm.mes = 6;

  IF v_dm_old IS NULL THEN
    RAISE EXCEPTION 'P14: dados_mensais ausente para Barra Jun/2026.';
  END IF;

  v_admin_new := v_admin_old || jsonb_build_object(
    'alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'alunos_nao_pagantes', v_alunos_nao_pagantes,
    'bolsistas_integrais', v_bolsistas_integrais,
    'bolsistas_integrais_regulares', v_bolsistas_integrais,
    'bolsistas_parciais', v_bolsistas_parciais,
    'alunos_trancados', v_alunos_trancados,
    'novas_matriculas', v_novas_matriculas,
    'novas_transferencias', v_transferencias_recebidas,
    'transferencias_recebidas', v_transferencias_recebidas,
    'entradas_administrativas', v_entradas_administrativas,
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_base_alunos_ativos', v_matriculas_base,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'alunos_com_2_curso', v_alunos_com_2_curso,
    'matriculas_2_curso_extras', v_matriculas_2_curso_extras,
    'evasoes', v_evasoes_base,
    'evasoes_bolsista', v_evasoes_bolsista,
    'total_evasoes', v_total_evasoes,
    'total_evasoes_label', v_total_evasoes_label
  );

  v_exec_new := v_exec_old || jsonb_build_object(
    'alunos_ativos', v_alunos_ativos,
    'total_alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'total_alunos_pagantes', v_alunos_pagantes,
    'alunos_nao_pagantes', v_alunos_nao_pagantes,
    'bolsistas_integrais', v_bolsistas_integrais,
    'total_bolsistas_integrais', v_bolsistas_integrais,
    'bolsistas_parciais', v_bolsistas_parciais,
    'total_bolsistas_parciais', v_bolsistas_parciais,
    'alunos_trancados', v_alunos_trancados,
    'novas_matriculas', v_novas_matriculas,
    'novas_transferencias', v_transferencias_recebidas,
    'transferencias_recebidas', v_transferencias_recebidas,
    'entradas_administrativas', v_entradas_administrativas,
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_base_alunos_ativos', v_matriculas_base,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'alunos_com_2_curso', v_alunos_com_2_curso,
    'matriculas_2_curso_extras', v_matriculas_2_curso_extras,
    'ticket_medio', v_ticket_medio,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_estimado', v_faturamento_previsto,
    'mrr', v_mrr_atual,
    'faturamento_realizado', v_mrr_atual,
    'ltv_medio', v_ltv_medio,
    'ltv', v_ltv_medio,
    'tempo_permanencia', v_tempo_permanencia,
    'tempo_permanencia_medio', v_tempo_permanencia,
    'churn_rate', v_churn_rate,
    'taxa_renovacao', v_taxa_renovacao,
    'reajuste_pct', v_reajuste_medio,
    'reajuste_medio', v_reajuste_medio,
    'inadimplencia', v_inadimplencia,
    'inadimplencia_pct', v_inadimplencia,
    'evasoes', v_evasoes_base,
    'evasoes_bolsista', v_evasoes_bolsista,
    'total_evasoes', v_total_evasoes,
    'total_evasoes_label', v_total_evasoes_label,
    'mrr_perdido', v_mrr_perdido
  );

  v_kpis_gestao_old := COALESCE(
    CASE
      WHEN jsonb_typeof(v_gerencial_old->'kpis_gestao') = 'array' THEN v_gerencial_old->'kpis_gestao'->0
      ELSE v_gerencial_old->'kpis_gestao'
    END,
    '{}'::jsonb
  );

  v_kpis_retencao_old := COALESCE(
    CASE
      WHEN jsonb_typeof(v_gerencial_old->'kpis_retencao') = 'array' THEN v_gerencial_old->'kpis_retencao'->0
      ELSE v_gerencial_old->'kpis_retencao'
    END,
    '{}'::jsonb
  );

  v_kpis_gestao_new := v_kpis_gestao_old || jsonb_build_object(
    'ano', 2026,
    'mes', 6,
    'unidade_id', v_barra,
    'alunos_ativos', v_alunos_ativos,
    'total_alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'total_alunos_pagantes', v_alunos_pagantes,
    'alunos_nao_pagantes', v_alunos_nao_pagantes,
    'bolsistas_integrais', v_bolsistas_integrais,
    'total_bolsistas_integrais', v_bolsistas_integrais,
    'bolsistas_parciais', v_bolsistas_parciais,
    'total_bolsistas_parciais', v_bolsistas_parciais,
    'alunos_trancados', v_alunos_trancados,
    'novas_matriculas', v_novas_matriculas,
    'novas_transferencias', v_transferencias_recebidas,
    'transferencias_recebidas', v_transferencias_recebidas,
    'entradas_administrativas', v_entradas_administrativas,
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_base_alunos_ativos', v_matriculas_base,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'alunos_com_2_curso', v_alunos_com_2_curso,
    'matriculas_2_curso_extras', v_matriculas_2_curso_extras,
    'ticket_medio', v_ticket_medio,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_estimado', v_faturamento_previsto,
    'mrr', v_mrr_atual,
    'faturamento_realizado', v_mrr_atual,
    'ltv_medio', v_ltv_medio,
    'tempo_permanencia', v_tempo_permanencia,
    'tempo_permanencia_medio', v_tempo_permanencia,
    'churn_rate', v_churn_rate,
    'taxa_renovacao', v_taxa_renovacao,
    'reajuste_pct', v_reajuste_medio,
    'reajuste_medio', v_reajuste_medio,
    'inadimplencia', v_inadimplencia,
    'inadimplencia_pct', v_inadimplencia,
    'evasoes', v_evasoes_base,
    'evasoes_bolsista', v_evasoes_bolsista,
    'total_evasoes', v_total_evasoes,
    'total_evasoes_label', v_total_evasoes_label
  );

  v_kpis_retencao_new := v_kpis_retencao_old || jsonb_build_object(
    'ano', 2026,
    'mes', 6,
    'unidade_id', v_barra,
    'total_evasoes', v_total_evasoes,
    'evasoes_base_alunos', v_evasoes_base,
    'evasoes_bolsista', v_evasoes_bolsista,
    'total_evasoes_label', v_total_evasoes_label,
    'taxa_evasao', v_churn_rate,
    'churn_rate', v_churn_rate,
    'mrr_perdido', v_mrr_perdido,
    'taxa_renovacao', v_taxa_renovacao,
    'renovacoes_previstas', COALESCE(NULLIF(v_kpis_retencao_old->>'renovacoes_previstas', '')::integer, 10),
    'renovacoes_realizadas', COALESCE(NULLIF(v_kpis_retencao_old->>'renovacoes_realizadas', '')::integer, 10),
    'nao_renovacoes', COALESCE(NULLIF(v_kpis_retencao_old->>'nao_renovacoes', '')::integer, 0)
  );

  v_gerencial_new := v_gerencial_old || jsonb_build_object(
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_base_alunos_ativos', v_matriculas_base,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'faturamento_previsto', v_faturamento_previsto,
    'faturamento_realizado', v_mrr_atual,
    'mrr', v_mrr_atual,
    'total_evasoes_label', v_total_evasoes_label
  );

  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_gestao}', jsonb_build_array(v_kpis_gestao_new), true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_retencao}', jsonb_build_array(v_kpis_retencao_new), true);
  v_gerencial_new := jsonb_set(v_gerencial_new, '{kpis_alunos_canonicos}', jsonb_build_array(v_kpis_gestao_new), true);

  UPDATE public.fechamento_mensal_snapshots
  SET
    payload = v_admin_new,
    payload_hash = public.hash_jsonb_canonico(v_admin_new),
    observacao = concat_ws(' | ', observacao, 'P14: retificacao Barra Jun/2026 conforme mensal administrativo validado.'),
    updated_at = now()
  WHERE id = v_admin_snapshot_id;

  UPDATE public.fechamento_mensal_snapshots
  SET
    payload = v_exec_new,
    payload_hash = public.hash_jsonb_canonico(v_exec_new),
    observacao = concat_ws(' | ', observacao, 'P14: retificacao Barra Jun/2026 conforme mensal administrativo validado.'),
    updated_at = now()
  WHERE id = v_exec_snapshot_id;

  UPDATE public.fechamento_mensal_snapshots
  SET
    payload = v_gerencial_new,
    payload_hash = public.hash_jsonb_canonico(v_gerencial_new),
    observacao = concat_ws(' | ', observacao, 'P14: retificacao do relatorio gerencial Barra Jun/2026 para alinhar ao mensal administrativo.'),
    updated_at = now()
  WHERE id = v_gerencial_snapshot_id;

  UPDATE public.dados_mensais
  SET
    alunos_ativos = v_alunos_ativos,
    alunos_pagantes = v_alunos_pagantes,
    novas_matriculas = v_novas_matriculas,
    evasoes = v_evasoes_base,
    churn_rate = v_churn_rate,
    ticket_medio = v_ticket_medio,
    taxa_renovacao = v_taxa_renovacao,
    tempo_permanencia = v_tempo_permanencia,
    inadimplencia = v_inadimplencia,
    reajuste_parcelas = v_reajuste_medio,
    matriculas_ativas = v_matriculas_ativas,
    matriculas_banda = v_matriculas_banda,
    matriculas_2_curso = v_matriculas_2_curso,
    bolsistas_integrais = v_bolsistas_integrais,
    bolsistas_parciais = v_bolsistas_parciais,
    updated_at = now()
  WHERE unidade_id = v_barra
    AND ano = 2026
    AND mes = 6;

  SELECT to_jsonb(dm.*) INTO v_dm_after
  FROM public.dados_mensais dm
  WHERE dm.unidade_id = v_barra
    AND dm.ano = 2026
    AND dm.mes = 6;

  INSERT INTO public.dados_mensais_retificacoes (
    unidade_id,
    ano,
    mes,
    motivo,
    solicitado_por,
    aprovado_por,
    origem,
    snapshot_antes,
    snapshot_depois,
    diff,
    observacoes,
    status,
    aplicada_em,
    aplicada_por
  )
  VALUES (
    v_barra,
    2026,
    6,
    'Retificacao Barra Jun/2026: relatorio gerencial divergente do mensal administrativo validado.',
    'Luciano Alf',
    'Luciano Alf',
    'p14_retificacao_relatorio_gerencial_barra_junho',
    jsonb_build_object(
      'dados_mensais', v_dm_old,
      'snapshot_alunos_admin', v_admin_old,
      'snapshot_alunos_executivo', v_exec_old,
      'snapshot_relatorio_gerencial', v_gerencial_old
    ),
    jsonb_build_object(
      'dados_mensais', v_dm_after,
      'snapshot_alunos_admin', v_admin_new,
      'snapshot_alunos_executivo', v_exec_new,
      'snapshot_relatorio_gerencial', v_gerencial_new
    ),
    jsonb_build_object(
      'alunos_ativos', jsonb_build_object('de', 238, 'para', v_alunos_ativos),
      'alunos_pagantes', jsonb_build_object('de', 236, 'para', v_alunos_pagantes),
      'novas_matriculas', jsonb_build_object('de', 13, 'para', v_novas_matriculas),
      'transferencias_recebidas', jsonb_build_object('de', 0, 'para', v_transferencias_recebidas),
      'matriculas_ativas', jsonb_build_object('de', 264, 'para', v_matriculas_ativas),
      'matriculas_base_alunos_ativos', jsonb_build_object('de', 238, 'para', v_matriculas_base),
      'ticket_medio', jsonb_build_object('de', 451.58, 'para', v_ticket_medio),
      'mrr_atual', jsonb_build_object('de', 106572.88, 'para', v_mrr_atual),
      'ltv_medio', jsonb_build_object('de', 6141.49, 'para', v_ltv_medio),
      'tempo_permanencia', jsonb_build_object('de', 13.6, 'para', v_tempo_permanencia),
      'churn_rate', jsonb_build_object('de', 1.69, 'para', v_churn_rate),
      'inadimplencia', jsonb_build_object('de', 1.69, 'para', v_inadimplencia),
      'mrr_perdido', jsonb_build_object('de', 1361.00, 'para', v_mrr_perdido),
      'total_evasoes_label', jsonb_build_object('de', '4', 'para', v_total_evasoes_label)
    ),
    'Retificacao aplicada sem sync Emusys; fonte operacional: relatorio mensal administrativo Barra Jun/2026 validado pela equipe.',
    'aplicada',
    now(),
    'Codex / Luciano Alf'
  );

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
    v_gerencial_snapshot_id,
    2026,
    6,
    'unidade',
    v_barra,
    'retificacao_solicitada',
    jsonb_build_object(
      'status', 'aplicada',
      'migration', '20260706223000_p14_retificar_barra_junho_relatorio_gerencial',
      'snapshot_alunos_admin_id', v_admin_snapshot_id,
      'snapshot_alunos_executivo_id', v_exec_snapshot_id,
      'snapshot_relatorio_gerencial_id', v_gerencial_snapshot_id,
      'gabarito', 'relatorio_mensal_administrativo_barra_junho_2026'
    ),
    NULL
  );
END $$;

