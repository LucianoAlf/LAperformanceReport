-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para buscar dados do programa Fideliza+
CREATE OR REPLACE FUNCTION get_programa_fideliza_dados(
  p_ano INTEGER DEFAULT 2026,
  p_trimestre INTEGER DEFAULT NULL,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
      'churn_maximo', c.meta_churn_maximo,
      'inadimplencia_maxima', c.meta_inadimplencia_maxima,
      'renovacao_minima', c.meta_renovacao_minima,
      'reajuste_minimo', c.meta_reajuste_minimo,
      'lojinha_campo_grande', (c.metas_lojinha->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::numeric,
      'lojinha_recreio', (c.metas_lojinha->>'95553e96-971b-4590-a6eb-0201d013c14d')::numeric,
      'lojinha_barra', (c.metas_lojinha->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::numeric
    ),
    'pontuacao', jsonb_build_object(
      'churn', c.pontos_churn,
      'inadimplencia', c.pontos_inadimplencia,
      'renovacao', c.pontos_renovacao,
      'reajuste', c.pontos_reajuste,
      'lojinha', c.pontos_lojinha
    ),
    'penalidades', jsonb_build_object(
      'nao_preencheu_sistema', c.penalidade_nao_preencheu_sistema,
      'nao_preencheu_lareport', c.penalidade_nao_preencheu_lareport,
      'reincidencia_mes', c.penalidade_reincidencia_mes
    ),
    'nota_corte', c.nota_corte,
    'criterio_desempate', c.criterio_desempate
  ) INTO v_config
  FROM programa_fideliza_config c
  WHERE c.ano = p_ano;
  
  IF v_config IS NULL THEN
    v_config := jsonb_build_object(
      'ano', p_ano,
      'metas', jsonb_build_object(
        'churn_maximo', 4,
        'inadimplencia_maxima', 1,
        'renovacao_minima', 90,
        'reajuste_minimo', 7,
        'lojinha_campo_grande', 5000,
        'lojinha_recreio', 3000,
        'lojinha_barra', 3000
      ),
      'pontuacao', jsonb_build_object(
        'churn', 25,
        'inadimplencia', 20,
        'renovacao', 25,
        'reajuste', 15,
        'lojinha', 15
      ),
      'penalidades', jsonb_build_object(
        'nao_preencheu_sistema', 3,
        'nao_preencheu_lareport', 3,
        'reincidencia_mes', 5
      ),
      'nota_corte', 60,
      'criterio_desempate', 'menor_churn'
    );
  END IF;

  WITH metricas_trimestre AS (
    SELECT 
      u.id as unidade_id,
      u.nome as unidade_nome,
      COALESCE(AVG(dm.churn_rate), 0) as churn_rate,
      COALESCE(AVG(dm.inadimplencia), 0) as inadimplencia_pct,
      COALESCE(AVG(dm.taxa_renovacao), 0) as taxa_renovacao,
      COALESCE(AVG(dm.reajuste_parcelas), 0) as reajuste_medio
    FROM unidades u
    LEFT JOIN dados_mensais dm ON dm.unidade_id = u.id 
      AND dm.ano = p_ano
      AND dm.mes BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3)
    WHERE u.ativo = true
      AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
    GROUP BY u.id, u.nome
  ),
  penalidades_totais AS (
    SELECT 
      unidade_id,
      SUM(pontos_descontados) as total_pontos,
      COUNT(*) as quantidade
    FROM programa_fideliza_penalidades
    WHERE ano = p_ano
      AND trimestre = v_trim_atual
      AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    GROUP BY unidade_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'unidade_id', mt.unidade_id,
      'unidade_nome', mt.unidade_nome,
      'farmers', CASE mt.unidade_id
        WHEN '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid THEN jsonb_build_object('nomes', 'Gabriela e Jhonatan', 'apelidos', 'Gabi & Jhon')
        WHEN '95553e96-971b-4590-a6eb-0201d013c14d'::uuid THEN jsonb_build_object('nomes', 'Fernanda e Daiana', 'apelidos', 'Fefe & Dai')
        WHEN '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid THEN jsonb_build_object('nomes', 'Eduarda e Arthur', 'apelidos', 'Duda & Arthur')
        ELSE jsonb_build_object('nomes', 'Equipe', 'apelidos', 'Equipe')
      END,
      'metricas', jsonb_build_object(
        'churn_rate', ROUND(mt.churn_rate::numeric, 2),
        'inadimplencia_pct', ROUND(mt.inadimplencia_pct::numeric, 2),
        'taxa_renovacao', ROUND(mt.taxa_renovacao::numeric, 2),
        'reajuste_medio', ROUND(mt.reajuste_medio::numeric, 2),
        'vendas_lojinha', 0
      ),
      'penalidades', jsonb_build_object(
        'total_pontos', COALESCE(pt.total_pontos, 0),
        'quantidade', COALESCE(pt.quantidade, 0)
      )
    )
  ) INTO v_farmers
  FROM metricas_trimestre mt
  LEFT JOIN penalidades_totais pt ON pt.unidade_id = mt.unidade_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'unidade_id', p.unidade_id,
      'unidade_nome', u.nome,
      'trimestre', p.trimestre,
      'tipo', p.tipo,
      'descricao', p.descricao,
      'pontos_descontados', p.pontos_descontados,
      'data_ocorrencia', p.data_ocorrencia,
      'registrado_por', p.registrado_por,
      'created_at', p.created_at
    )
    ORDER BY p.data_ocorrencia DESC
  ) INTO v_penalidades
  FROM programa_fideliza_penalidades p
  JOIN unidades u ON u.id = p.unidade_id
  WHERE p.ano = p_ano
    AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id);

  SELECT jsonb_agg(
    jsonb_build_object(
      'ano', h.ano,
      'trimestre', h.trimestre,
      'unidade_id', h.unidade_id,
      'unidade_nome', u.nome,
      'churn_rate', h.churn_rate,
      'inadimplencia_pct', h.inadimplencia_pct,
      'taxa_renovacao', h.taxa_renovacao,
      'reajuste_medio', h.reajuste_medio,
      'vendas_lojinha', h.vendas_lojinha,
      'bateu_churn', h.bateu_churn,
      'bateu_inadimplencia', h.bateu_inadimplencia,
      'bateu_renovacao', h.bateu_renovacao,
      'bateu_reajuste', h.bateu_reajuste,
      'bateu_lojinha', h.bateu_lojinha,
      'pontos_total', h.pontos_total,
      'posicao', h.posicao,
      'experiencia_tipo', h.experiencia_tipo
    )
    ORDER BY h.trimestre
  ) INTO v_historico
  FROM programa_fideliza_historico h
  JOIN unidades u ON u.id = h.unidade_id
  WHERE h.ano = p_ano
    AND (p_unidade_id IS NULL OR h.unidade_id = p_unidade_id);

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'tipo', e.tipo,
      'nome', e.nome,
      'descricao', e.descricao,
      'emoji', e.emoji,
      'valor_estimado', e.valor_estimado
    )
    ORDER BY e.tipo, e.nome
  ) INTO v_experiencias
  FROM programa_fideliza_experiencias e
  WHERE e.ativo = true;

  RETURN jsonb_build_object(
    'config', v_config,
    'trimestre_atual', v_trim_atual,
    'farmers', COALESCE(v_farmers, '[]'::jsonb),
    'penalidades', COALESCE(v_penalidades, '[]'::jsonb),
    'historico', COALESCE(v_historico, '[]'::jsonb),
    'experiencias', COALESCE(v_experiencias, '[]'::jsonb)
  );
END;
$$;
