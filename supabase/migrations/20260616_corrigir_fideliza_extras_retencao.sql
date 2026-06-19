-- ============================================
-- Migration: Corrigir Fideliza+ para excluir atividades extras em churn/evasões
-- Segurança: não altera dados. Apenas redefine função existente.
-- ============================================

CREATE OR REPLACE FUNCTION public.get_programa_fideliza_dados(p_ano integer DEFAULT 2026, p_trimestre integer DEFAULT NULL::integer, p_unidade_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_config JSONB;
  v_farmers JSONB;
  v_penalidades JSONB;
  v_historico JSONB;
  v_experiencias JSONB;
  v_trim_atual INTEGER;
BEGIN
  IF p_trimestre IS NULL THEN
    v_trim_atual := CEIL(EXTRACT(MONTH FROM CURRENT_DATE)::numeric / 3);
  ELSE
    v_trim_atual := p_trimestre;
  END IF;

  SELECT jsonb_build_object(
    'ano', c.ano,
    'metas', jsonb_build_object(
      'churn_maximo', c.meta_churn_maximo, 'inadimplencia_maxima', c.meta_inadimplencia_maxima,
      'renovacao_minima', c.meta_renovacao_minima, 'reajuste_minimo', c.meta_reajuste_minimo,
      'lojinha_campo_grande', (c.metas_lojinha->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::numeric,
      'lojinha_recreio', (c.metas_lojinha->>'95553e96-971b-4590-a6eb-0201d013c14d')::numeric,
      'lojinha_barra', (c.metas_lojinha->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::numeric
    ),
    'pontuacao', jsonb_build_object(
      'churn', c.pontos_churn, 'inadimplencia', c.pontos_inadimplencia,
      'renovacao', c.pontos_renovacao, 'reajuste', c.pontos_reajuste, 'lojinha', c.pontos_lojinha
    ),
    'penalidades', jsonb_build_object(
      'nao_preencheu_sistema', c.penalidade_nao_preencheu_sistema,
      'nao_preencheu_lareport', c.penalidade_nao_preencheu_lareport,
      'reincidencia_mes', c.penalidade_reincidencia_mes
    ),
    'nota_corte', c.nota_corte, 'criterio_desempate', c.criterio_desempate
  ) INTO v_config
  FROM programa_fideliza_config c WHERE c.ano = p_ano;
  
  IF v_config IS NULL THEN
    v_config := jsonb_build_object(
      'ano', p_ano,
      'metas', jsonb_build_object('churn_maximo', 4, 'inadimplencia_maxima', 1, 'renovacao_minima', 90, 'reajuste_minimo', 7, 'lojinha_campo_grande', 5000, 'lojinha_recreio', 3000, 'lojinha_barra', 3000),
      'pontuacao', jsonb_build_object('churn', 25, 'inadimplencia', 20, 'renovacao', 25, 'reajuste', 15, 'lojinha', 15),
      'penalidades', jsonb_build_object('nao_preencheu_sistema', 3, 'nao_preencheu_lareport', 3, 'reincidencia_mes', 5),
      'nota_corte', 60, 'criterio_desempate', 'menor_churn'
    );
  END IF;

  WITH meses_trimestre AS (
    SELECT generate_series(((v_trim_atual - 1) * 3 + 1), (v_trim_atual * 3)) AS mes
  ),
  evasoes_mes AS (
    SELECT m.unidade_id, EXTRACT(MONTH FROM m.data)::INTEGER AS mes, COUNT(*) AS total_evasoes
    FROM movimentacoes_admin m
    LEFT JOIN alunos aluno_mov ON aluno_mov.id = m.aluno_id
    WHERE m.tipo IN ('evasao', 'nao_renovacao')
      AND EXTRACT(YEAR FROM m.data) = p_ano
      AND EXTRACT(MONTH FROM m.data) BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3)
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      AND NOT public.is_atividade_extra_curso(COALESCE(m.curso_id, aluno_mov.curso_id))
    GROUP BY m.unidade_id, EXTRACT(MONTH FROM m.data)
  ),
  evasoes_trimestre AS (
    SELECT unidade_id, SUM(total_evasoes) AS total_evasoes FROM evasoes_mes GROUP BY unidade_id
  ),
  alunos_base_mes AS (
    SELECT u.id AS unidade_id, mt.mes,
      COALESCE(
        (SELECT dm.alunos_pagantes FROM dados_mensais dm WHERE dm.unidade_id = u.id 
         AND (CASE WHEN mt.mes = 1 THEN dm.ano = p_ano - 1 AND dm.mes = 12
              ELSE dm.ano = p_ano AND dm.mes = mt.mes - 1 END)),
        (SELECT COUNT(*) FROM alunos a WHERE a.unidade_id = u.id AND a.status IN ('ativo', 'trancado'))
      ) AS alunos_pagantes_anterior
    FROM unidades u CROSS JOIN meses_trimestre mt
    WHERE u.ativo = true AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
  ),
  alunos_base_trimestre AS (
    SELECT unidade_id, ROUND(AVG(alunos_pagantes_anterior)::numeric, 0) AS alunos_base_media
    FROM alunos_base_mes WHERE alunos_pagantes_anterior > 0 GROUP BY unidade_id
  ),
  churn_mes AS (
    SELECT ab.unidade_id, ab.mes, COALESCE(em.total_evasoes, 0) AS evasoes, ab.alunos_pagantes_anterior,
      CASE WHEN ab.alunos_pagantes_anterior > 0 
        THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / ab.alunos_pagantes_anterior * 100, 2) ELSE 0 END AS churn_rate
    FROM alunos_base_mes ab LEFT JOIN evasoes_mes em ON em.unidade_id = ab.unidade_id AND em.mes = ab.mes
  ),
  churn_meses_detalhado AS (
    SELECT unidade_id, jsonb_agg(jsonb_build_object('mes', mes, 'evasoes', evasoes, 'alunos', alunos_pagantes_anterior, 'taxa', churn_rate) ORDER BY mes) AS meses
    FROM churn_mes GROUP BY unidade_id
  ),
  renovacoes_trim AS (
    SELECT r.unidade_id, COUNT(*) FILTER (WHERE r.status = 'renovado') AS renovados, COUNT(*) AS total_contratos,
      COALESCE(AVG(r.percentual_reajuste) FILTER (WHERE r.status = 'renovado'), 0) AS reajuste_medio
    FROM renovacoes r
    WHERE EXTRACT(YEAR FROM r.data_renovacao) = p_ano
      AND EXTRACT(MONTH FROM r.data_renovacao) BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3)
      AND (p_unidade_id IS NULL OR r.unidade_id = p_unidade_id)
    GROUP BY r.unidade_id
  ),
  metricas_trimestre AS (
    SELECT u.id AS unidade_id, u.nome AS unidade_nome,
      COALESCE((SELECT AVG(cm.churn_rate) FROM churn_mes cm WHERE cm.unidade_id = u.id AND cm.alunos_pagantes_anterior > 0), 0) AS churn_rate,
      COALESCE((SELECT AVG(dm.inadimplencia) FROM dados_mensais dm WHERE dm.unidade_id = u.id AND dm.ano = p_ano 
        AND dm.mes BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3) AND dm.inadimplencia > 0), 0) AS inadimplencia_pct,
      COALESCE(CASE WHEN rt.total_contratos > 0 THEN ROUND(rt.renovados::numeric / rt.total_contratos * 100, 2) ELSE 0 END, 0) AS taxa_renovacao,
      COALESCE(rt.reajuste_medio, 0) AS reajuste_medio,
      COALESCE(et.total_evasoes, 0) AS total_evasoes, COALESCE(abt.alunos_base_media, 0) AS alunos_base,
      COALESCE(rt.renovados, 0) AS renovados, COALESCE(rt.total_contratos, 0) AS total_contratos,
      COALESCE(cmd.meses, '[]'::jsonb) AS churn_meses
    FROM unidades u 
    LEFT JOIN renovacoes_trim rt ON rt.unidade_id = u.id
    LEFT JOIN evasoes_trimestre et ON et.unidade_id = u.id
    LEFT JOIN alunos_base_trimestre abt ON abt.unidade_id = u.id
    LEFT JOIN churn_meses_detalhado cmd ON cmd.unidade_id = u.id
    WHERE u.ativo = true AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
  ),
  penalidades_totais AS (
    SELECT unidade_id, SUM(pontos_descontados) AS total_pontos, COUNT(*) AS quantidade
    FROM programa_fideliza_penalidades WHERE ano = p_ano AND trimestre = v_trim_atual AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    GROUP BY unidade_id
  )
  SELECT jsonb_agg(jsonb_build_object(
    'unidade_id', mt.unidade_id, 'unidade_nome', mt.unidade_nome,
    'farmers', CASE mt.unidade_id
      WHEN '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid THEN jsonb_build_object('nomes', 'Gabriela e Jhonatan', 'apelidos', 'Gabi & Jhon')
      WHEN '95553e96-971b-4590-a6eb-0201d013c14d'::uuid THEN jsonb_build_object('nomes', 'Fernanda e Daiana', 'apelidos', 'Fefe & Dai')
      WHEN '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid THEN jsonb_build_object('nomes', 'Eduarda e Arthur', 'apelidos', 'Duda & Arthur')
      ELSE jsonb_build_object('nomes', 'Equipe', 'apelidos', 'Equipe')
    END,
    'metricas', jsonb_build_object(
      'churn_rate', ROUND(mt.churn_rate::numeric, 2), 'inadimplencia_pct', ROUND(mt.inadimplencia_pct::numeric, 2),
      'taxa_renovacao', ROUND(mt.taxa_renovacao::numeric, 2), 'reajuste_medio', ROUND(mt.reajuste_medio::numeric, 2), 'vendas_lojinha', 0,
      'churn_bruto', jsonb_build_object('evasoes', mt.total_evasoes, 'alunos_base', mt.alunos_base, 'meses', mt.churn_meses),
      'renovacao_bruto', jsonb_build_object('renovados', mt.renovados, 'total_contratos', mt.total_contratos)
    ),
    'penalidades', jsonb_build_object('total_pontos', COALESCE(pt.total_pontos, 0), 'quantidade', COALESCE(pt.quantidade, 0))
  )) INTO v_farmers
  FROM metricas_trimestre mt LEFT JOIN penalidades_totais pt ON pt.unidade_id = mt.unidade_id;

  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'unidade_id', p.unidade_id, 'unidade_nome', u.nome, 'trimestre', p.trimestre,
    'tipo', p.tipo, 'descricao', p.descricao, 'pontos_descontados', p.pontos_descontados,
    'data_ocorrencia', p.data_ocorrencia, 'registrado_por', p.registrado_por, 'created_at', p.created_at
  ) ORDER BY p.data_ocorrencia DESC) INTO v_penalidades
  FROM programa_fideliza_penalidades p JOIN unidades u ON u.id = p.unidade_id
  WHERE p.ano = p_ano AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id);

  SELECT jsonb_agg(jsonb_build_object(
    'ano', h.ano, 'trimestre', h.trimestre, 'unidade_id', h.unidade_id, 'unidade_nome', u.nome,
    'churn_rate', h.churn_rate, 'inadimplencia_pct', h.inadimplencia_pct, 'taxa_renovacao', h.taxa_renovacao,
    'reajuste_medio', h.reajuste_medio, 'vendas_lojinha', h.vendas_lojinha,
    'bateu_churn', h.bateu_churn, 'bateu_inadimplencia', h.bateu_inadimplencia,
    'bateu_renovacao', h.bateu_renovacao, 'bateu_reajuste', h.bateu_reajuste, 'bateu_lojinha', h.bateu_lojinha,
    'pontos_total', h.pontos_total, 'posicao', h.posicao, 'experiencia_tipo', h.experiencia_tipo
  ) ORDER BY h.trimestre) INTO v_historico
  FROM programa_fideliza_historico h JOIN unidades u ON u.id = h.unidade_id
  WHERE h.ano = p_ano AND (p_unidade_id IS NULL OR h.unidade_id = p_unidade_id);

  SELECT jsonb_agg(jsonb_build_object(
    'id', e.id, 'tipo', e.tipo, 'nome', e.nome, 'descricao', e.descricao, 'emoji', e.emoji, 'valor_estimado', e.valor_estimado
  ) ORDER BY e.tipo, e.nome) INTO v_experiencias
  FROM programa_fideliza_experiencias e WHERE e.ativo = true;

  RETURN jsonb_build_object(
    'config', v_config, 'trimestre_atual', v_trim_atual,
    'farmers', COALESCE(v_farmers, '[]'::jsonb), 'penalidades', COALESCE(v_penalidades, '[]'::jsonb),
    'historico', COALESCE(v_historico, '[]'::jsonb), 'experiencias', COALESCE(v_experiencias, '[]'::jsonb)
  );
END;
$function$
;


COMMENT ON FUNCTION public.get_programa_fideliza_dados(integer, integer, uuid)
IS 'Programa Fideliza+: churn/evasões excluem atividades extras via is_atividade_extra_curso(COALESCE(movimentacoes_admin.curso_id, alunos.curso_id)).';
