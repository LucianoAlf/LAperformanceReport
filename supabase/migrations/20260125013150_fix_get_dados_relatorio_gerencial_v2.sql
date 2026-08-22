-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função simplificada para gerar dados do Relatório Gerencial
DROP FUNCTION IF EXISTS get_dados_relatorio_gerencial(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_dados_relatorio_gerencial(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_mes INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_mes_anterior INTEGER;
  v_ano_mes_anterior INTEGER;
  v_unidade_nome TEXT;
BEGIN
  -- Calcular mês anterior
  IF p_mes = 1 THEN
    v_mes_anterior := 12;
    v_ano_mes_anterior := p_ano - 1;
  ELSE
    v_mes_anterior := p_mes - 1;
    v_ano_mes_anterior := p_ano;
  END IF;

  -- Buscar nome da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  -- Construir resultado
  v_result := jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', TO_CHAR(TO_DATE(p_mes::TEXT, 'MM'), 'TMMonth'),
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome
    )
  );

  -- KPIs de Gestão
  v_result := v_result || jsonb_build_object('kpis_gestao', (
    SELECT COALESCE(jsonb_agg(row_to_json(kg)::jsonb), '[]'::jsonb)
    FROM vw_kpis_gestao_mensal kg
    WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
  ));

  -- KPIs de Retenção
  v_result := v_result || jsonb_build_object('kpis_retencao', (
    SELECT COALESCE(jsonb_agg(row_to_json(kr)::jsonb), '[]'::jsonb)
    FROM vw_kpis_retencao_mensal kr
    WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id)
  ));

  -- KPIs Comerciais
  v_result := v_result || jsonb_build_object('kpis_comercial', (
    SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
    FROM vw_kpis_comercial_mensal kc
    WHERE kc.ano = p_ano AND kc.mes = p_mes
      AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
  ));

  -- Metas (simplificado)
  v_result := v_result || jsonb_build_object('metas', '[]'::jsonb);

  -- Dados do mês anterior
  v_result := v_result || jsonb_build_object('mes_anterior', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado
    )), '[]'::jsonb)
    FROM dados_mensais dm
    WHERE dm.ano = v_ano_mes_anterior AND dm.mes = v_mes_anterior
      AND (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ));

  -- Mesmo mês ano passado
  v_result := v_result || jsonb_build_object('mesmo_mes_ano_passado', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado
    )), '[]'::jsonb)
    FROM dados_mensais dm
    WHERE dm.ano = p_ano - 1 AND dm.mes = p_mes
      AND (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ));

  -- Comercial mês anterior
  v_result := v_result || jsonb_build_object('comercial_mes_anterior', (
    SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
    FROM vw_kpis_comercial_mensal kc
    WHERE kc.ano = v_ano_mes_anterior AND kc.mes = v_mes_anterior
      AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
  ));

  -- Comercial ano passado
  v_result := v_result || jsonb_build_object('comercial_ano_passado', (
    SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
    FROM vw_kpis_comercial_mensal kc
    WHERE kc.ano = p_ano - 1 AND kc.mes = p_mes
      AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
  ));

  -- Motivos de evasão
  v_result := v_result || jsonb_build_object('motivos_evasao', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'motivo', sub.motivo,
      'quantidade', sub.quantidade,
      'percentual', sub.percentual
    )), '[]'::jsonb)
    FROM (
      SELECT 
        e.motivo,
        COUNT(*)::INTEGER as quantidade,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 1)::NUMERIC as percentual
      FROM evasoes_v2 e
      JOIN alunos a ON e.aluno_id = a.id
      WHERE EXTRACT(YEAR FROM e.data) = p_ano
        AND EXTRACT(MONTH FROM e.data) = p_mes
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY e.motivo
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) sub
  ));

  -- Permanência por faixa
  v_result := v_result || jsonb_build_object('permanencia_por_faixa', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'faixa', sub.faixa,
      'quantidade', sub.quantidade,
      'percentual', sub.percentual
    ) ORDER BY sub.ordem), '[]'::jsonb)
    FROM (
      SELECT 
        CASE 
          WHEN a.tempo_permanencia_meses < 6 THEN '0-6 meses'
          WHEN a.tempo_permanencia_meses < 12 THEN '6-12 meses'
          WHEN a.tempo_permanencia_meses < 24 THEN '1-2 anos'
          WHEN a.tempo_permanencia_meses < 36 THEN '2-3 anos'
          ELSE '3+ anos'
        END as faixa,
        CASE 
          WHEN a.tempo_permanencia_meses < 6 THEN 1
          WHEN a.tempo_permanencia_meses < 12 THEN 2
          WHEN a.tempo_permanencia_meses < 24 THEN 3
          WHEN a.tempo_permanencia_meses < 36 THEN 4
          ELSE 5
        END as ordem,
        COUNT(*)::INTEGER as quantidade,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 1)::NUMERIC as percentual
      FROM alunos a
      WHERE a.status = 'ativo' AND a.classificacao = 'pagante'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY faixa, ordem
    ) sub
  ));

  -- Dados do mês atual
  v_result := v_result || jsonb_build_object('dados_mes_atual', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado,
      'saldo_liquido', dm.saldo_liquido
    )), '[]'::jsonb)
    FROM dados_mensais dm
    WHERE dm.ano = p_ano AND dm.mes = p_mes
      AND (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ));

  -- Renovações
  v_result := v_result || jsonb_build_object('renovacoes', '[]'::jsonb);

  RETURN v_result;
END;
$$;
