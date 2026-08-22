-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir função get_dados_retencao_ia para usar colunas corretas da view vw_kpis_gestao_mensal
CREATE OR REPLACE FUNCTION public.get_dados_retencao_ia(
  p_unidade_id uuid DEFAULT NULL::uuid, 
  p_ano integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer, 
  p_mes integer DEFAULT (EXTRACT(month FROM CURRENT_DATE))::integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
    
    -- CORRIGIDO: usar nomes corretos das colunas da view vw_kpis_gestao_mensal
    'kpis_gestao', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', kg.unidade_id,
        'unidade_nome', kg.unidade_nome,
        'total_alunos_ativos', COALESCE(kg.total_alunos, 0),
        'total_alunos_pagantes', COALESCE(kg.alunos_pagantes, 0),
        'ticket_medio', COALESCE(kg.ticket_medio, 0),
        'mrr', COALESCE(kg.mrr, 0),
        'tempo_permanencia_medio', 0,
        'ltv_medio', 0,
        'inadimplencia_pct', 0,
        'faturamento_previsto', COALESCE(kg.mrr, 0),
        'faturamento_realizado', COALESCE(kg.mrr, 0),
        'churn_rate', COALESCE(kg.churn_rate, 0),
        'total_evasoes', COALESCE(kg.evasoes, 0)
      )), '[]'::json)
      FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
        AND kg.ano = p_ano
        AND kg.mes = p_mes
    ),
    
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
        AND kr.ano = p_ano
        AND kr.mes = p_mes
    ),
    
    'renovacoes_proximas', (
      SELECT COALESCE(json_agg(row_to_json(rp)), '[]'::json)
      FROM get_resumo_renovacoes_proximas(p_unidade_id) rp
    ),
    
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
    
    'metas', (
      SELECT COALESCE(json_agg(json_build_object(
        'unidade_id', m.unidade_id,
        'meta_leads', m.meta_leads,
        'meta_experimentais', m.meta_experimentais,
        'meta_matriculas', m.meta_matriculas,
        'meta_taxa_conversao_experimental', m.meta_taxa_conversao_experimental,
        'meta_taxa_conversao_lead', m.meta_taxa_conversao_lead,
        'meta_faturamento_passaportes', m.meta_faturamento_passaportes,
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
      WHERE (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id OR m.unidade_id IS NULL)
        AND m.ano = p_ano
        AND (m.mes = p_mes OR m.mes IS NULL)
        AND m.ativo = true
    ),
    
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
    
    'permanencia_por_faixa', (
      SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa,
        'quantidade', quantidade,
        'percentual', ROUND((quantidade::numeric / NULLIF(total, 0) * 100), 1)
      ) ORDER BY ordem), '[]'::json)
      FROM (
        SELECT 
          CASE 
            WHEN tempo_permanencia_meses < 6 THEN '0-6 meses'
            WHEN tempo_permanencia_meses < 12 THEN '6-12 meses'
            WHEN tempo_permanencia_meses < 24 THEN '1-2 anos'
            WHEN tempo_permanencia_meses < 36 THEN '2-3 anos'
            ELSE '3+ anos'
          END as faixa,
          CASE 
            WHEN tempo_permanencia_meses < 6 THEN 1
            WHEN tempo_permanencia_meses < 12 THEN 2
            WHEN tempo_permanencia_meses < 24 THEN 3
            WHEN tempo_permanencia_meses < 36 THEN 4
            ELSE 5
          END as ordem,
          COUNT(*) as quantidade,
          SUM(COUNT(*)) OVER () as total
        FROM alunos
        WHERE status = 'ativo'
          AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
        GROUP BY faixa, ordem
      ) sub
    ),
    
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
$function$;
