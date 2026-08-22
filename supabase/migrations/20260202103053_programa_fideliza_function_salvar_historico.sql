-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para salvar snapshot trimestral
CREATE OR REPLACE FUNCTION salvar_historico_trimestral_fideliza(
  p_ano INTEGER,
  p_trimestre INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config programa_fideliza_config%ROWTYPE;
BEGIN
  SELECT * INTO v_config FROM programa_fideliza_config WHERE ano = p_ano;
  
  INSERT INTO programa_fideliza_historico (
    ano, trimestre, unidade_id, 
    churn_rate, inadimplencia_pct, taxa_renovacao, reajuste_medio, vendas_lojinha,
    bateu_churn, bateu_inadimplencia, bateu_renovacao, bateu_reajuste, bateu_lojinha,
    pontos_base, pontos_penalidades, pontos_total
  )
  SELECT 
    p_ano,
    p_trimestre,
    u.id,
    COALESCE(AVG(dm.churn_rate), 0),
    COALESCE(AVG(dm.inadimplencia), 0),
    COALESCE(AVG(dm.taxa_renovacao), 0),
    COALESCE(AVG(dm.reajuste_parcelas), 0),
    0,
    COALESCE(AVG(dm.churn_rate), 100) <= v_config.meta_churn_maximo,
    COALESCE(AVG(dm.inadimplencia), 100) <= v_config.meta_inadimplencia_maxima,
    COALESCE(AVG(dm.taxa_renovacao), 0) >= v_config.meta_renovacao_minima,
    COALESCE(AVG(dm.reajuste_parcelas), 0) >= v_config.meta_reajuste_minimo,
    FALSE,
    (CASE WHEN COALESCE(AVG(dm.churn_rate), 100) <= v_config.meta_churn_maximo THEN v_config.pontos_churn ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.inadimplencia), 100) <= v_config.meta_inadimplencia_maxima THEN v_config.pontos_inadimplencia ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.taxa_renovacao), 0) >= v_config.meta_renovacao_minima THEN v_config.pontos_renovacao ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.reajuste_parcelas), 0) >= v_config.meta_reajuste_minimo THEN v_config.pontos_reajuste ELSE 0 END),
    COALESCE((SELECT SUM(pontos_descontados) FROM programa_fideliza_penalidades WHERE ano = p_ano AND trimestre = p_trimestre AND unidade_id = u.id), 0),
    (CASE WHEN COALESCE(AVG(dm.churn_rate), 100) <= v_config.meta_churn_maximo THEN v_config.pontos_churn ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.inadimplencia), 100) <= v_config.meta_inadimplencia_maxima THEN v_config.pontos_inadimplencia ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.taxa_renovacao), 0) >= v_config.meta_renovacao_minima THEN v_config.pontos_renovacao ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.reajuste_parcelas), 0) >= v_config.meta_reajuste_minimo THEN v_config.pontos_reajuste ELSE 0 END) -
    COALESCE((SELECT SUM(pontos_descontados) FROM programa_fideliza_penalidades WHERE ano = p_ano AND trimestre = p_trimestre AND unidade_id = u.id), 0)
  FROM unidades u
  LEFT JOIN dados_mensais dm ON dm.unidade_id = u.id 
    AND dm.ano = p_ano
    AND dm.mes BETWEEN ((p_trimestre - 1) * 3 + 1) AND (p_trimestre * 3)
  WHERE u.ativo = true
  GROUP BY u.id
  ON CONFLICT (ano, trimestre, unidade_id) 
  DO UPDATE SET
    churn_rate = EXCLUDED.churn_rate,
    inadimplencia_pct = EXCLUDED.inadimplencia_pct,
    taxa_renovacao = EXCLUDED.taxa_renovacao,
    reajuste_medio = EXCLUDED.reajuste_medio,
    vendas_lojinha = EXCLUDED.vendas_lojinha,
    bateu_churn = EXCLUDED.bateu_churn,
    bateu_inadimplencia = EXCLUDED.bateu_inadimplencia,
    bateu_renovacao = EXCLUDED.bateu_renovacao,
    bateu_reajuste = EXCLUDED.bateu_reajuste,
    bateu_lojinha = EXCLUDED.bateu_lojinha,
    pontos_base = EXCLUDED.pontos_base,
    pontos_penalidades = EXCLUDED.pontos_penalidades,
    pontos_total = EXCLUDED.pontos_total,
    updated_at = NOW();
  
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY pontos_total DESC, churn_rate ASC) as pos
    FROM programa_fideliza_historico
    WHERE ano = p_ano AND trimestre = p_trimestre
  )
  UPDATE programa_fideliza_historico h
  SET posicao = r.pos
  FROM ranked r
  WHERE h.id = r.id;
  
  UPDATE programa_fideliza_historico
  SET experiencia_tipo = CASE 
    WHEN bateu_churn AND bateu_inadimplencia AND bateu_renovacao AND bateu_reajuste AND bateu_lojinha THEN 'premium'
    WHEN (bateu_churn::int + bateu_inadimplencia::int + bateu_renovacao::int + bateu_reajuste::int + bateu_lojinha::int) >= 4 THEN 'standard'
    ELSE NULL
  END
  WHERE ano = p_ano AND trimestre = p_trimestre;
  
  RETURN jsonb_build_object('success', true, 'trimestre', p_trimestre);
END;
$$;
