-- Migration: recalcular_dados_mensais v2
-- Corrige cálculos de snapshot mensal para alinhar com regras canônicas validadas
-- NÃO inclui faturamento_estimado nem saldo_liquido (GENERATED ALWAYS)
-- Churn rate usa base atual (pagantes do próprio mês)

CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_fim_mes DATE;
  v_alunos_ativos INTEGER;
  v_alunos_pagantes INTEGER;
  v_matriculas_ativas INTEGER;
  v_matriculas_banda INTEGER;
  v_matriculas_2_curso INTEGER;
  v_novas_matriculas INTEGER;
  v_evasoes INTEGER;
  v_churn_rate NUMERIC;
  v_ticket_medio NUMERIC;
  v_tempo_permanencia NUMERIC;
  v_taxa_renovacao NUMERIC;
  v_reajuste_medio NUMERIC;
BEGIN
  v_fim_mes := (DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day')::DATE;

  -- 1. ALUNOS ATIVOS: exclui segundo curso, snapshot no fim do mês
  SELECT COUNT(*) INTO v_alunos_ativos
  FROM alunos
  WHERE unidade_id = p_unidade_id
    AND COALESCE(is_segundo_curso, false) = false
    AND data_matricula <= v_fim_mes
    AND (data_saida IS NULL OR data_saida > v_fim_mes);

  -- 2. ALUNOS PAGANTES: exclui bolsistas e segundo curso
  SELECT COUNT(*) INTO v_alunos_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = p_unidade_id
    AND COALESCE(a.is_segundo_curso, false) = false
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND (tm.conta_como_pagante = true OR tm.id IS NULL);

  -- 3. MATRÍCULAS ATIVAS: todos (inclui segundo curso, banda, bolsistas)
  SELECT COUNT(*) INTO v_matriculas_ativas
  FROM alunos
  WHERE unidade_id = p_unidade_id
    AND data_matricula <= v_fim_mes
    AND (data_saida IS NULL OR data_saida > v_fim_mes);

  -- 4. MATRÍCULAS BANDA
  SELECT COUNT(*) INTO v_matriculas_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND c.is_projeto_banda = true;

  -- 5. MATRÍCULAS 2º CURSO
  SELECT COUNT(*) INTO v_matriculas_2_curso
  FROM alunos
  WHERE unidade_id = p_unidade_id
    AND COALESCE(is_segundo_curso, false) = true
    AND data_matricula <= v_fim_mes
    AND (data_saida IS NULL OR data_saida > v_fim_mes);

  -- 6. NOVAS MATRÍCULAS: exclui segundo curso, banda, coral, bolsistas
  SELECT COUNT(*) INTO v_novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND COALESCE(a.is_segundo_curso, false) = false
    AND EXTRACT(YEAR FROM a.data_matricula) = p_ano
    AND EXTRACT(MONTH FROM a.data_matricula) = p_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND (tm.conta_como_pagante = true OR tm.id IS NULL)
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%');

  -- 7. EVASÕES: interrompido + não renovação (canônico)
  SELECT COUNT(*) INTO v_evasoes
  FROM movimentacoes_admin
  WHERE unidade_id = p_unidade_id
    AND tipo IN ('evasao', 'nao_renovacao')
    AND EXTRACT(YEAR FROM data) = p_ano
    AND EXTRACT(MONTH FROM data) = p_mes;

  -- 8. CHURN RATE: evasões / pagantes atuais (base atual aprovada)
  v_churn_rate := CASE
    WHEN COALESCE(v_alunos_pagantes, 0) > 0
    THEN ROUND((v_evasoes::NUMERIC / v_alunos_pagantes) * 100, 2)
    ELSE 0
  END;

  -- 9. TICKET MÉDIO: média dos pagantes, inclui inadimplentes
  SELECT COALESCE(ROUND(AVG(a.valor_parcela), 2), 0) INTO v_ticket_medio
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = p_unidade_id
    AND COALESCE(a.is_segundo_curso, false) = false
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND (tm.entra_ticket_medio = true OR tm.id IS NULL);

  -- 10. TEMPO DE PERMANÊNCIA MÉDIO
  SELECT COALESCE(ROUND(AVG(tempo_permanencia_meses), 1), 0) INTO v_tempo_permanencia
  FROM alunos
  WHERE unidade_id = p_unidade_id
    AND data_matricula <= v_fim_mes
    AND (data_saida IS NULL OR data_saida > v_fim_mes);

  -- 11. TAXA DE RENOVAÇÃO: renovação / (renovação + não renovação)
  WITH renov_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE tipo = 'renovacao') AS renov_count,
      COUNT(*) FILTER (WHERE tipo = 'nao_renovacao') AS nao_renov_count
    FROM movimentacoes_admin
    WHERE unidade_id = p_unidade_id
      AND EXTRACT(YEAR FROM data) = p_ano
      AND EXTRACT(MONTH FROM data) = p_mes
  )
  SELECT CASE
    WHEN (renov_count + nao_renov_count) > 0
    THEN ROUND((renov_count::NUMERIC / (renov_count + nao_renov_count)) * 100, 2)
    ELSE 0
  END INTO v_taxa_renovacao
  FROM renov_stats;

  -- 12. REAJUSTE MÉDIO: só aumentos positivos
  SELECT COALESCE(ROUND(AVG(
    CASE
      WHEN valor_parcela_anterior > 0 AND valor_parcela_novo > valor_parcela_anterior
      THEN ((valor_parcela_novo - valor_parcela_anterior) / valor_parcela_anterior) * 100
      ELSE NULL
    END
  ), 2), 0) INTO v_reajuste_medio
  FROM movimentacoes_admin
  WHERE unidade_id = p_unidade_id
    AND tipo = 'renovacao'
    AND EXTRACT(YEAR FROM data) = p_ano
    AND EXTRACT(MONTH FROM data) = p_mes
    AND valor_parcela_anterior > 0
    AND valor_parcela_novo > valor_parcela_anterior;

  -- UPSERT (sem faturamento_estimado e saldo_liquido — GENERATED ALWAYS)
  INSERT INTO dados_mensais (
    unidade_id, ano, mes,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, reajuste_parcelas,
    updated_at
  ) VALUES (
    p_unidade_id, p_ano, p_mes,
    v_alunos_ativos, v_alunos_pagantes, v_matriculas_ativas,
    v_matriculas_banda, v_matriculas_2_curso,
    v_novas_matriculas, v_evasoes,
    v_churn_rate, v_ticket_medio, v_tempo_permanencia,
    v_taxa_renovacao, v_reajuste_medio,
    NOW()
  )
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    alunos_ativos = EXCLUDED.alunos_ativos,
    alunos_pagantes = EXCLUDED.alunos_pagantes,
    matriculas_ativas = EXCLUDED.matriculas_ativas,
    matriculas_banda = EXCLUDED.matriculas_banda,
    matriculas_2_curso = EXCLUDED.matriculas_2_curso,
    novas_matriculas = EXCLUDED.novas_matriculas,
    evasoes = EXCLUDED.evasoes,
    churn_rate = EXCLUDED.churn_rate,
    ticket_medio = EXCLUDED.ticket_medio,
    tempo_permanencia = EXCLUDED.tempo_permanencia,
    taxa_renovacao = EXCLUDED.taxa_renovacao,
    reajuste_parcelas = EXCLUDED.reajuste_parcelas,
    updated_at = NOW();

  -- Retorno JSON com derivados (faturamento e saldo calculados automaticamente pelo banco)
  v_result := jsonb_build_object(
    'alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'matriculas_ativas', v_matriculas_ativas,
    'novas_matriculas', v_novas_matriculas,
    'evasoes', v_evasoes,
    'churn_rate', v_churn_rate,
    'ticket_medio', v_ticket_medio,
    'taxa_renovacao', v_taxa_renovacao,
    'reajuste_medio', v_reajuste_medio,
    'faturamento_estimado', v_alunos_pagantes * v_ticket_medio,
    'saldo_liquido', v_novas_matriculas - v_evasoes
  );

  RETURN v_result;
END;
$$;
