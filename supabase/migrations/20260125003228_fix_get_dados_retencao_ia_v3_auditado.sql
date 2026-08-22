-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- FIX v3: Função get_dados_retencao_ia AUDITADA
-- Baseada na estrutura REAL das tabelas do banco
-- ============================================================

-- Primeiro, dropar a função existente
DROP FUNCTION IF EXISTS get_dados_retencao_ia(UUID, INT, INT);

-- Recriar com estrutura correta baseada na auditoria
CREATE OR REPLACE FUNCTION get_dados_retencao_ia(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  p_mes INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT
)
RETURNS JSON AS $$
DECLARE
  resultado JSON;
  mes_anterior INT;
  ano_anterior INT;
  ano_passado INT;
BEGIN
  -- Calcular mês anterior
  IF p_mes = 1 THEN
    mes_anterior := 12;
    ano_anterior := p_ano - 1;
  ELSE
    mes_anterior := p_mes - 1;
    ano_anterior := p_ano;
  END IF;
  ano_passado := p_ano - 1;

  SELECT json_build_object(
    'periodo', json_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', TRIM(TO_CHAR(TO_DATE(p_mes::text, 'MM'), 'Month'))
    ),
    
    -- KPIs atuais de gestão (view vw_kpis_gestao_mensal)
    'kpis_gestao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kg.unidade_id,
        'unidade_nome', kg.unidade_nome,
        'total_alunos_ativos', kg.total_alunos_ativos,
        'total_alunos_pagantes', kg.total_alunos_pagantes,
        'ticket_medio', kg.ticket_medio,
        'mrr', kg.mrr,
        'tempo_permanencia_medio', kg.tempo_permanencia_medio,
        'ltv_medio', kg.ltv_medio,
        'inadimplencia_pct', kg.inadimplencia_pct,
        'faturamento_previsto', kg.faturamento_previsto,
        'faturamento_realizado', kg.faturamento_realizado,
        'churn_rate', kg.churn_rate,
        'total_evasoes', kg.total_evasoes
      )), '[]'::json)
      FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
    ),
    
    -- KPIs de retenção (view vw_kpis_retencao_mensal)
    'kpis_retencao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kr.unidade_id,
        'unidade_nome', kr.unidade_nome,
        'total_evasoes', kr.total_evasoes,
        'avisos_previos', kr.avisos_previos,
        'renovacoes_previstas', kr.renovacoes_previstas,
        'renovacoes_realizadas', kr.renovacoes_realizadas,
        'nao_renovacoes', kr.nao_renovacoes,
        'renovacoes_pendentes', kr.renovacoes_pendentes,
        'taxa_renovacao', kr.taxa_renovacao,
        'taxa_nao_renovacao', kr.taxa_nao_renovacao,
        'mrr_perdido', kr.mrr_perdido
      )), '[]'::json)
      FROM vw_kpis_retencao_mensal kr
      WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id)
    ),
    
    -- Resumo de renovações próximas (view vw_renovacoes_proximas)
    'renovacoes_proximas', (
      SELECT COALESCE(json_agg(row_to_json(rp)), '[]'::json)
      FROM get_resumo_renovacoes_proximas(p_unidade_id) rp
    ),
    
    -- Lista de alunos com renovação urgente (da view vw_renovacoes_proximas)
    'alunos_renovacao_urgente', (
      SELECT COALESCE(json_agg(json_build_object(
        'aluno_nome', rp.aluno_nome,
        'professor_nome', rp.professor_nome,
        'curso_nome', rp.curso_nome,
        'valor_parcela', rp.valor_parcela,
        'dias_ate_vencimento', rp.dias_ate_vencimento,
        'tempo_permanencia_meses', rp.tempo_permanencia_meses,
        'telefone', rp.telefone
      ) ORDER BY rp.dias_ate_vencimento), '[]'::json)
      FROM vw_renovacoes_proximas rp
      WHERE (p_unidade_id IS NULL OR rp.unidade_id = p_unidade_id)
        AND rp.status_renovacao IN ('vencido', 'urgente_7_dias')
      LIMIT 20
    ),
    
    -- Dados do mês anterior (tabela dados_mensais)
    'mes_anterior', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia,
        'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::json)
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
        AND dm.ano = ano_anterior
        AND dm.mes = mes_anterior
    ),
    
    -- Dados do mesmo mês do ano passado (sazonalidade)
    'mesmo_mes_ano_passado', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'inadimplencia', dm.inadimplencia,
        'tempo_permanencia', dm.tempo_permanencia,
        'reajuste_parcelas', dm.reajuste_parcelas
      )), '[]'::json)
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
        AND dm.ano = ano_passado
        AND dm.mes = p_mes
    ),
    
    -- TODAS as metas do painel de gestão (tabela metas)
    'metas', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', m.unidade_id,
        -- Metas Comerciais
        'meta_leads', m.meta_leads,
        'meta_experimentais', m.meta_experimentais,
        'meta_matriculas', m.meta_matriculas,
        'meta_taxa_conversao_experimental', m.meta_taxa_conversao_experimental,
        'meta_taxa_conversao_lead', m.meta_taxa_conversao_lead,
        'meta_faturamento_passaportes', m.meta_faturamento_passaportes,
        -- Metas de Gestão/Retenção
        'meta_alunos_pagantes', m.meta_alunos_pagantes,
        'meta_alunos_ativos', m.meta_alunos_ativos,
        'meta_ticket_medio', m.meta_ticket_medio,
        'meta_churn_maximo', m.meta_churn_maximo,
        'meta_evasoes_maximo', m.meta_evasoes_maximo,
        'meta_renovacoes', m.meta_renovacoes,
        'meta_taxa_renovacao', m.meta_taxa_renovacao,
        'meta_inadimplencia_maxima', m.meta_inadimplencia_maxima,
        'meta_ltv_meses', m.meta_ltv_meses,
        'meta_faturamento_parcelas', m.meta_faturamento_parcelas
      )), '[]'::json)
      FROM metas m
      WHERE (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        AND m.ano = p_ano
        AND m.mes = p_mes
        AND m.ativo = true
    ),
    
    -- Evasões recentes (tabela evasoes_v2 - campos corretos da auditoria)
    'evasoes_recentes', (
      SELECT COALESCE(json_agg(json_build_object(
        'aluno_nome', a.nome,
        'professor_nome', p.nome,
        'motivo', ms.nome,
        'tipo_saida', ts.nome,
        'valor_parcela', e.valor_parcela,
        'tempo_permanencia', a.tempo_permanencia_meses,
        'data_saida', e.data_evasao
      ) ORDER BY e.data_evasao DESC), '[]'::json)
      FROM evasoes_v2 e
      LEFT JOIN alunos a ON e.aluno_id = a.id
      LEFT JOIN professores p ON e.professor_id = p.id
      LEFT JOIN motivos_saida ms ON e.motivo_saida_id = ms.id
      LEFT JOIN tipos_saida ts ON e.tipo_saida_id = ts.id
      WHERE (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
        AND e.data_evasao >= (CURRENT_DATE - INTERVAL '30 days')
      LIMIT 15
    ),
    
    -- Estatísticas de permanência por faixa
    'permanencia_por_faixa', (
      SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa,
        'quantidade', quantidade,
        'percentual', ROUND((quantidade::numeric / NULLIF(total, 0) * 100), 1)
      )), '[]'::json)
      FROM (
        SELECT 
          CASE 
            WHEN tempo_permanencia_meses < 6 THEN '0-6 meses'
            WHEN tempo_permanencia_meses < 12 THEN '6-12 meses'
            WHEN tempo_permanencia_meses < 24 THEN '1-2 anos'
            WHEN tempo_permanencia_meses < 36 THEN '2-3 anos'
            ELSE '3+ anos'
          END as faixa,
          COUNT(*) as quantidade,
          SUM(COUNT(*)) OVER () as total
        FROM alunos
        WHERE status = 'ativo'
          AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
        GROUP BY 1
        ORDER BY 
          CASE 
            WHEN tempo_permanencia_meses < 6 THEN 1
            WHEN tempo_permanencia_meses < 12 THEN 2
            WHEN tempo_permanencia_meses < 24 THEN 3
            WHEN tempo_permanencia_meses < 36 THEN 4
            ELSE 5
          END
      ) sub
    ),
    
    -- Dados do mês atual da tabela dados_mensais (para reajuste médio)
    'dados_mes_atual', (
      SELECT COALESCE(json_agg(json_build_object(
        'alunos_pagantes', dm.alunos_pagantes,
        'novas_matriculas', dm.novas_matriculas,
        'evasoes', dm.evasoes,
        'churn_rate', dm.churn_rate,
        'ticket_medio', dm.ticket_medio,
        'taxa_renovacao', dm.taxa_renovacao,
        'tempo_permanencia', dm.tempo_permanencia,
        'inadimplencia', dm.inadimplencia,
        'reajuste_parcelas', dm.reajuste_parcelas,
        'faturamento_estimado', dm.faturamento_estimado,
        'saldo_liquido', dm.saldo_liquido
      )), '[]'::json)
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
        AND dm.ano = p_ano
        AND dm.mes = p_mes
    )
    
  ) INTO resultado;
  
  RETURN resultado;
END;
$$ LANGUAGE plpgsql;

-- Grant
GRANT EXECUTE ON FUNCTION get_dados_retencao_ia TO authenticated;
