-- ============================================
-- Migration: fechar sobras legadas de atividades extras em retenção/pesquisa
-- Segurança: não altera dados. Apenas redefine funções.
-- ============================================

CREATE OR REPLACE FUNCTION public.get_dados_retencao_ia_legacy_p01g(p_unidade_id uuid, p_ano integer, p_mes integer)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  resultado JSON;
  mes_anterior INT;
  ano_anterior INT;
  ano_passado INT;
BEGIN
  IF p_mes = 1 THEN
    mes_anterior := 12;
    ano_anterior := p_ano - 1;
  ELSE
    mes_anterior := p_mes - 1;
    ano_anterior := p_ano;
  END IF;
  ano_passado := p_ano - 1;

  SELECT json_build_object(
    'periodo', json_build_object('ano', p_ano, 'mes', p_mes, 'mes_nome', TRIM(TO_CHAR(TO_DATE(p_mes::text, 'MM'), 'Month'))),
    'kpis_gestao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kg.unidade_id, 'unidade_nome', kg.unidade_nome,
        'total_alunos_ativos', COALESCE(kg.total_alunos_ativos, 0),
        'total_alunos_pagantes', COALESCE(kg.total_alunos_pagantes, 0),
        'ticket_medio', COALESCE(kg.ticket_medio, 0), 'mrr', COALESCE(kg.mrr, 0),
        'tempo_permanencia_medio', COALESCE(kg.tempo_permanencia_medio, 0),
        'ltv_medio', COALESCE(kg.ltv_medio, 0), 'inadimplencia_pct', COALESCE(kg.inadimplencia_pct, 0),
        'faturamento_previsto', COALESCE(kg.faturamento_previsto, 0),
        'faturamento_realizado', COALESCE(kg.faturamento_realizado, 0),
        'churn_rate', COALESCE(kg.churn_rate, 0), 'total_evasoes', COALESCE(kg.total_evasoes, 0)
      )), '[]'::json) FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id) AND kg.ano = p_ano AND kg.mes = p_mes
    ),
    'kpis_retencao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kr.unidade_id, 'unidade_nome', kr.unidade_nome,
        'total_evasoes', kr.total_evasoes, 'avisos_previos', kr.avisos_previos,
        'renovacoes_previstas', kr.renovacoes_previstas, 'renovacoes_realizadas', kr.renovacoes_realizadas,
        'nao_renovacoes', kr.nao_renovacoes, 'renovacoes_pendentes', kr.renovacoes_pendentes,
        'taxa_renovacao', kr.taxa_renovacao, 'taxa_nao_renovacao', kr.taxa_nao_renovacao,
        'mrr_perdido', kr.mrr_perdido
      )), '[]'::json) FROM vw_kpis_retencao_mensal kr
      WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id) AND kr.ano = p_ano AND kr.mes = p_mes
    ),
    'renovacoes_proximas', (SELECT COALESCE(json_agg(row_to_json(rp)), '[]'::json) FROM get_resumo_renovacoes_proximas(p_unidade_id) rp),
    'alunos_renovacao_urgente', (
      SELECT COALESCE(json_agg(json_build_object(
        'aluno_nome', rp.aluno_nome, 'professor_nome', rp.professor_nome, 'curso_nome', rp.curso_nome,
        'valor_parcela', rp.valor_parcela, 'dias_ate_vencimento', rp.dias_ate_vencimento,
        'tempo_permanencia_meses', rp.tempo_permanencia_meses, 'telefone', rp.telefone
      ) ORDER BY rp.dias_ate_vencimento), '[]'::json)
      FROM vw_renovacoes_proximas rp
      WHERE (p_unidade_id IS NULL OR rp.unidade_id = p_unidade_id) AND rp.status_renovacao IN ('vencido', 'urgente_7_dias')
      LIMIT 20
    ),
    'mes_anterior', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes, 'churn_rate', dm.churn_rate, 'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao, 'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia, 'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::json) FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id) AND dm.ano = ano_anterior AND dm.mes = mes_anterior
    ),
    'mesmo_mes_ano_passado', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes, 'churn_rate', dm.churn_rate, 'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao, 'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia, 'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::json) FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id) AND dm.ano = ano_passado AND dm.mes = p_mes
    ),
    'metas', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', mt.unidade_id, 'meta_leads', mt.meta_leads, 'meta_experimentais', mt.meta_experimentais,
        'meta_matriculas', mt.meta_matriculas, 'meta_taxa_conversao_experimental', mt.meta_taxa_conversao_experimental,
        'meta_taxa_conversao_lead', mt.meta_taxa_conversao_lead, 'meta_faturamento_passaportes', mt.meta_faturamento_passaportes,
        'meta_alunos_pagantes', mt.meta_alunos_pagantes, 'meta_alunos_ativos', mt.meta_alunos_ativos,
        'meta_ticket_medio', mt.meta_ticket_medio, 'meta_churn_maximo', mt.meta_churn_maximo,
        'meta_evasoes_maximo', mt.meta_evasoes_maximo, 'meta_renovacoes', mt.meta_renovacoes,
        'meta_taxa_renovacao', mt.meta_taxa_renovacao, 'meta_inadimplencia_maxima', mt.meta_inadimplencia_maxima,
        'meta_ltv_meses', mt.meta_ltv_meses, 'meta_faturamento_parcelas', mt.meta_faturamento_parcelas
      )), '[]'::json) FROM metas mt
      WHERE (p_unidade_id IS NULL OR mt.unidade_id = p_unidade_id OR mt.unidade_id IS NULL)
        AND mt.ano = p_ano AND (mt.mes = p_mes OR mt.mes IS NULL) AND mt.ativo = true
    ),
    'evasoes_recentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'aluno_nome', a.nome, 'professor_nome', pr.nome, 'motivo', ms.nome,
        'tipo_saida', m.tipo, 'valor_parcela', COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior),
        'tempo_permanencia', a.tempo_permanencia_meses, 'data_saida', m.data
      ) ORDER BY m.data DESC), '[]'::json)
      FROM movimentacoes_admin m
      LEFT JOIN alunos a ON m.aluno_id = a.id
      LEFT JOIN professores pr ON m.professor_id = pr.id
      LEFT JOIN motivos_saida ms ON m.motivo_saida_id = ms.id
      WHERE m.tipo IN ('evasao', 'nao_renovacao', 'aviso_previo')
        AND (m.tipo = 'aviso_previo' OR public.is_movimentacao_admin_retencao_valida(m.id))
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        AND m.data >= (CURRENT_DATE - INTERVAL '30 days')
      LIMIT 15
    ),
    'permanencia_por_faixa', (
      SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'quantidade', quantidade,
        'percentual', ROUND((quantidade::numeric / NULLIF(total, 0) * 100), 1)
      ) ORDER BY ordem), '[]'::json)
      FROM (
        SELECT CASE WHEN tempo_permanencia_meses < 6 THEN '0-6 meses' WHEN tempo_permanencia_meses < 12 THEN '6-12 meses'
          WHEN tempo_permanencia_meses < 24 THEN '1-2 anos' WHEN tempo_permanencia_meses < 36 THEN '2-3 anos' ELSE '3+ anos' END as faixa,
          CASE WHEN tempo_permanencia_meses < 6 THEN 1 WHEN tempo_permanencia_meses < 12 THEN 2
          WHEN tempo_permanencia_meses < 24 THEN 3 WHEN tempo_permanencia_meses < 36 THEN 4 ELSE 5 END as ordem,
          COUNT(*) as quantidade, SUM(COUNT(*)) OVER () as total
        FROM alunos WHERE status = 'ativo' AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
        GROUP BY faixa, ordem
      ) sub
    ),
    'dados_mes_atual', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes, 'novas_matriculas', dm.novas_matriculas,
        'evasoes', dm.evasoes, 'churn_rate', dm.churn_rate, 'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao, 'tempo_permanencia', dm.tempo_permanencia,
        'inadimplencia', dm.inadimplencia, 'reajuste_parcelas', dm.reajuste_parcelas,
        'faturamento_estimado', dm.faturamento_estimado, 'saldo_liquido', dm.saldo_liquido
      )), '[]'::json) FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id) AND dm.ano = p_ano AND dm.mes = p_mes
    )
  ) INTO resultado;
  
  RETURN resultado;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pode_enviar_pesquisa_evasao(p_evasao_id integer)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_data_evasao DATE;
  v_dias_desde_evasao INTEGER;
BEGIN
  SELECT data INTO v_data_evasao
  FROM movimentacoes_admin
  WHERE id = p_evasao_id
    AND public.is_movimentacao_admin_retencao_valida(id);
  
  IF v_data_evasao IS NULL THEN
    RETURN FALSE;
  END IF;
  
  v_dias_desde_evasao := CURRENT_DATE - v_data_evasao;
  RETURN v_dias_desde_evasao >= 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_pesquisa_evasao(p_evasao_id integer, p_criado_por text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_pesquisa_id UUID;
  v_evasao RECORD;
BEGIN
  SELECT 
    m.id,
    m.aluno_id,
    m.unidade_id,
    m.aluno_nome,
    COALESCE(m.telefone_snapshot, a.whatsapp, a.telefone) AS telefone_snapshot,
    m.data AS data_evasao,
    ms.nome as motivo,
    c.nome as curso,
    pr.nome as professor,
    COALESCE(a.tempo_permanencia_meses, 0) as tempo_meses
  INTO v_evasao
  FROM movimentacoes_admin m
  LEFT JOIN alunos a ON a.id = m.aluno_id
  LEFT JOIN cursos c ON c.id = COALESCE(m.curso_id, a.curso_id)
  LEFT JOIN professores pr ON pr.id = COALESCE(m.professor_id, a.professor_atual_id)
  LEFT JOIN motivos_saida ms ON ms.id = m.motivo_saida_id
  WHERE m.id = p_evasao_id
    AND public.is_movimentacao_admin_retencao_valida(m.id);
  
  IF v_evasao.id IS NULL THEN
    RAISE EXCEPTION 'Evasão não encontrada ou atividade extra fora da retenção: %', p_evasao_id;
  END IF;
  
  IF v_evasao.telefone_snapshot IS NULL THEN
    RAISE EXCEPTION 'Evasão sem telefone: %', p_evasao_id;
  END IF;
  
  INSERT INTO pesquisa_evasao (
    evasao_id, aluno_id, unidade_id,
    aluno_nome, aluno_telefone, aluno_curso, aluno_professor,
    tempo_permanencia_meses, data_evasao, motivo_cadastrado,
    status, enviado_em, enviado_por
  ) VALUES (
    v_evasao.id, v_evasao.aluno_id, v_evasao.unidade_id,
    v_evasao.aluno_nome, v_evasao.telefone_snapshot, v_evasao.curso, v_evasao.professor,
    v_evasao.tempo_meses, v_evasao.data_evasao, v_evasao.motivo,
    'enviado', now(), p_criado_por
  )
  ON CONFLICT (evasao_id) DO UPDATE SET
    status = 'enviado',
    enviado_em = now(),
    enviado_por = p_criado_por,
    updated_at = now()
  RETURNING id INTO v_pesquisa_id;
  
  RETURN v_pesquisa_id;
END;
$function$;

