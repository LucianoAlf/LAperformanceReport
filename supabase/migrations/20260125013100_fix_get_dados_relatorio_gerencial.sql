-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir função para gerar dados do Relatório Gerencial do Mês
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

  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', TO_CHAR(TO_DATE(p_mes::TEXT, 'MM'), 'TMMonth'),
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome
    ),
    
    -- KPIs de Gestão (Financeiros + Base de Alunos)
    'kpis_gestao', (
      SELECT COALESCE(jsonb_agg(row_to_json(kg)::jsonb), '[]'::jsonb)
      FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
    ),
    
    -- KPIs de Retenção
    'kpis_retencao', (
      SELECT COALESCE(jsonb_agg(row_to_json(kr)::jsonb), '[]'::jsonb)
      FROM vw_kpis_retencao_mensal kr
      WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id)
    ),
    
    -- KPIs Comerciais (Funil)
    'kpis_comercial', (
      SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
      FROM vw_kpis_comercial_mensal kc
      WHERE kc.ano = p_ano AND kc.mes = p_mes
        AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
    ),
    
    -- Metas do mês (usando simulacoes_metas - estrutura correta)
    'metas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'unidade_id', sm.unidade_id,
        'meta_alunos_pagantes', sm.alunos_objetivo,
        'meta_ticket_medio', sm.ticket_medio,
        'meta_churn_maximo', sm.churn_projetado,
        'meta_matriculas', sm.matriculas_mensais,
        'meta_leads', sm.leads_mensais,
        'meta_experimentais', sm.experimentais_mensais,
        'meta_inadimplencia_maxima', sm.inadimplencia_pct,
        'meta_taxa_renovacao', 100
      )), '[]'::jsonb)
      FROM simulacoes_metas sm
      WHERE sm.ano = p_ano
        AND (p_unidade_id IS NULL OR sm.unidade_id = p_unidade_id)
      ORDER BY sm.criado_em DESC
      LIMIT 1
    ),
    
    -- Dados do mês anterior (comparativo)
    'mes_anterior', (
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
    ),
    
    -- Mesmo mês do ano passado (sazonalidade)
    'mesmo_mes_ano_passado', (
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
    ),
    
    -- KPIs comerciais do mês anterior
    'comercial_mes_anterior', (
      SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
      FROM vw_kpis_comercial_mensal kc
      WHERE kc.ano = v_ano_mes_anterior AND kc.mes = v_mes_anterior
        AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
    ),
    
    -- KPIs comerciais do mesmo mês ano passado
    'comercial_ano_passado', (
      SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
      FROM vw_kpis_comercial_mensal kc
      WHERE kc.ano = p_ano - 1 AND kc.mes = p_mes
        AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
    ),
    
    -- Motivos de evasão (top 5)
    'motivos_evasao', (
      SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
      FROM (
        SELECT 
          e.motivo,
          COUNT(*) as quantidade,
          ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 1) as percentual
        FROM evasoes_v2 e
        JOIN alunos a ON e.aluno_id = a.id
        WHERE EXTRACT(YEAR FROM e.data) = p_ano
          AND EXTRACT(MONTH FROM e.data) = p_mes
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY e.motivo
        ORDER BY COUNT(*) DESC
        LIMIT 5
      ) sub
    ),
    
    -- Distribuição por permanência
    'permanencia_por_faixa', (
      SELECT COALESCE(jsonb_agg(sub ORDER BY sub.ordem), '[]'::jsonb)
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
          COUNT(*) as quantidade,
          ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 1) as percentual
        FROM alunos a
        WHERE a.status = 'ativo' AND a.classificacao = 'pagante'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY faixa, ordem
      ) sub
    ),
    
    -- Dados do mês atual (dados_mensais)
    'dados_mes_atual', (
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
    ),
    
    -- Renovações do mês
    'renovacoes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'total_renovacoes', (SELECT COUNT(*) FROM renovacoes_v2 r2 JOIN alunos a2 ON r2.aluno_id = a2.id 
          WHERE r2.tipo = 'renovacao' AND EXTRACT(YEAR FROM r2.data) = p_ano AND EXTRACT(MONTH FROM r2.data) = p_mes
          AND (p_unidade_id IS NULL OR a2.unidade_id = p_unidade_id)),
        'total_nao_renovacoes', (SELECT COUNT(*) FROM renovacoes_v2 r2 JOIN alunos a2 ON r2.aluno_id = a2.id 
          WHERE r2.tipo = 'nao_renovacao' AND EXTRACT(YEAR FROM r2.data) = p_ano AND EXTRACT(MONTH FROM r2.data) = p_mes
          AND (p_unidade_id IS NULL OR a2.unidade_id = p_unidade_id)),
        'reajuste_medio', (SELECT ROUND(AVG(
          CASE WHEN r2.valor_parcela_anterior > 0 
            THEN ((r2.valor_parcela_novo - r2.valor_parcela_anterior) / r2.valor_parcela_anterior * 100)
            ELSE 0 
          END
        ), 1) FROM renovacoes_v2 r2 JOIN alunos a2 ON r2.aluno_id = a2.id 
          WHERE r2.tipo = 'renovacao' AND EXTRACT(YEAR FROM r2.data) = p_ano AND EXTRACT(MONTH FROM r2.data) = p_mes
          AND (p_unidade_id IS NULL OR a2.unidade_id = p_unidade_id))
      )), '[]'::jsonb)
    )
    
  ) INTO v_result;

  RETURN v_result;
END;
$$;
