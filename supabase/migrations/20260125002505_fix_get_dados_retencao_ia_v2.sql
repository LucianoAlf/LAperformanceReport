-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- FIX v2: Corrigir função get_dados_retencao_ia - estrutura correta da tabela metas
-- ============================================================

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
      'mes_nome', TO_CHAR(TO_DATE(p_mes::text, 'MM'), 'Month')
    ),
    
    -- KPIs atuais de gestão
    'kpis_gestao', (
      SELECT COALESCE(json_agg(row_to_json(kg)), '[]'::json)
      FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
    ),
    
    -- KPIs de retenção
    'kpis_retencao', (
      SELECT COALESCE(json_agg(row_to_json(kr)), '[]'::json)
      FROM vw_kpis_retencao_mensal kr
      WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id)
    ),
    
    -- Resumo de renovações próximas
    'renovacoes_proximas', (
      SELECT COALESCE(json_agg(row_to_json(rp)), '[]'::json)
      FROM get_resumo_renovacoes_proximas(p_unidade_id) rp
    ),
    
    -- Lista de alunos com renovação urgente (7 dias)
    'alunos_renovacao_urgente', (
      SELECT COALESCE(json_agg(aluno_data ORDER BY aluno_data->>'dias_ate_vencimento'), '[]'::json)
      FROM (
        SELECT json_build_object(
          'aluno_nome', aluno_nome,
          'professor_nome', professor_nome,
          'curso_nome', curso_nome,
          'valor_parcela', valor_parcela,
          'dias_ate_vencimento', dias_ate_vencimento,
          'tempo_permanencia_meses', tempo_permanencia_meses,
          'telefone', telefone
        ) as aluno_data
        FROM vw_renovacoes_proximas
        WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
          AND status_renovacao IN ('vencido', 'urgente_7_dias')
        LIMIT 20
      ) sub
    ),
    
    -- Dados do mês anterior (para comparação)
    'mes_anterior', (
      SELECT COALESCE(json_agg(row_to_json(dm)), '[]'::json)
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id::text = p_unidade_id::text)
        AND dm.ano = ano_anterior
        AND dm.mes = mes_anterior
    ),
    
    -- Dados do mesmo mês do ano passado (sazonalidade)
    'mesmo_mes_ano_passado', (
      SELECT COALESCE(json_agg(row_to_json(dm)), '[]'::json)
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id::text = p_unidade_id::text)
        AND dm.ano = ano_passado
        AND dm.mes = p_mes
    ),
    
    -- Metas definidas para o período (estrutura correta da tabela metas)
    'metas', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', m.unidade_id,
        'meta_churn_maximo', m.meta_churn_maximo,
        'meta_renovacoes', m.meta_renovacoes,
        'meta_taxa_renovacao', m.meta_taxa_renovacao,
        'meta_evasoes_maximo', m.meta_evasoes_maximo,
        'meta_ticket_medio', m.meta_ticket_medio,
        'meta_inadimplencia_maxima', m.meta_inadimplencia_maxima,
        'meta_alunos_pagantes', m.meta_alunos_pagantes,
        'meta_ltv_meses', m.meta_ltv_meses
      )), '[]'::json)
      FROM metas m
      WHERE (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        AND m.ano = p_ano
        AND m.mes = p_mes
        AND m.ativo = true
    ),
    
    -- Evasões recentes com motivos
    'evasoes_recentes', (
      SELECT COALESCE(json_agg(evasao_data ORDER BY evasao_data->>'data_saida' DESC), '[]'::json)
      FROM (
        SELECT json_build_object(
          'aluno_nome', e.aluno_nome,
          'professor_nome', p.nome,
          'motivo', ms.nome,
          'tipo_saida', ts.nome,
          'valor_parcela', e.valor_parcela,
          'tempo_permanencia', e.tempo_permanencia_meses,
          'data_saida', e.data_saida
        ) as evasao_data
        FROM evasoes_v2 e
        LEFT JOIN professores p ON e.professor_id = p.id
        LEFT JOIN motivos_saida ms ON e.motivo_saida_id = ms.id
        LEFT JOIN tipos_saida ts ON e.tipo_saida_id = ts.id
        WHERE (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
          AND e.data_saida >= (CURRENT_DATE - INTERVAL '30 days')
        LIMIT 15
      ) sub
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
    )
    
  ) INTO resultado;
  
  RETURN resultado;
END;
$$ LANGUAGE plpgsql;
