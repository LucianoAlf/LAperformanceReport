-- ============================================================
-- Migration: Recursos para IA de Retenção (Sucesso do Cliente)
-- Data: 2026-01-24
-- Descrição: View de renovações próximas e função para dados de retenção
-- ============================================================

-- ============================================================
-- 1. VIEW: Alunos com renovação próxima
-- ============================================================
DROP VIEW IF EXISTS vw_renovacoes_proximas;

CREATE OR REPLACE VIEW vw_renovacoes_proximas AS
SELECT 
  a.id as aluno_id,
  a.nome as aluno_nome,
  a.unidade_id,
  u.nome as unidade_nome,
  a.professor_atual_id,
  p.nome as professor_nome,
  c.nome as curso_nome,
  a.valor_parcela,
  a.data_inicio_contrato,
  a.data_fim_contrato,
  a.tempo_permanencia_meses,
  a.classificacao,
  a.telefone,
  a.whatsapp,
  a.email,
  -- Dias até vencimento (negativo = já venceu)
  CASE 
    WHEN a.data_fim_contrato IS NOT NULL 
    THEN (a.data_fim_contrato - CURRENT_DATE)
    ELSE NULL
  END as dias_ate_vencimento,
  -- Categorização
  CASE 
    WHEN a.data_fim_contrato IS NULL THEN 'sem_data'
    WHEN a.data_fim_contrato < CURRENT_DATE THEN 'vencido'
    WHEN a.data_fim_contrato <= CURRENT_DATE + INTERVAL '7 days' THEN 'urgente_7_dias'
    WHEN a.data_fim_contrato <= CURRENT_DATE + INTERVAL '15 days' THEN 'atencao_15_dias'
    WHEN a.data_fim_contrato <= CURRENT_DATE + INTERVAL '30 days' THEN 'proximo_30_dias'
    ELSE 'ok'
  END as status_renovacao
FROM alunos a
LEFT JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN professores p ON a.professor_atual_id = p.id
LEFT JOIN cursos c ON a.curso_id = c.id
WHERE a.status = 'ativo';

-- ============================================================
-- 2. FUNÇÃO: Resumo de renovações próximas por unidade
-- ============================================================
CREATE OR REPLACE FUNCTION get_resumo_renovacoes_proximas(
  p_unidade_id UUID DEFAULT NULL
)
RETURNS TABLE (
  unidade_id UUID,
  unidade_nome TEXT,
  total_ativos BIGINT,
  sem_data_contrato BIGINT,
  vencidos BIGINT,
  urgente_7_dias BIGINT,
  atencao_15_dias BIGINT,
  proximo_30_dias BIGINT,
  ok BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rp.unidade_id,
    rp.unidade_nome::TEXT,
    COUNT(*)::BIGINT as total_ativos,
    COUNT(*) FILTER (WHERE rp.status_renovacao = 'sem_data')::BIGINT as sem_data_contrato,
    COUNT(*) FILTER (WHERE rp.status_renovacao = 'vencido')::BIGINT as vencidos,
    COUNT(*) FILTER (WHERE rp.status_renovacao = 'urgente_7_dias')::BIGINT as urgente_7_dias,
    COUNT(*) FILTER (WHERE rp.status_renovacao = 'atencao_15_dias')::BIGINT as atencao_15_dias,
    COUNT(*) FILTER (WHERE rp.status_renovacao = 'proximo_30_dias')::BIGINT as proximo_30_dias,
    COUNT(*) FILTER (WHERE rp.status_renovacao = 'ok')::BIGINT as ok
  FROM vw_renovacoes_proximas rp
  WHERE (p_unidade_id IS NULL OR rp.unidade_id = p_unidade_id)
  GROUP BY rp.unidade_id, rp.unidade_nome;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. FUNÇÃO: Dados completos para IA de retenção
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
      SELECT json_agg(row_to_json(kg))
      FROM vw_kpis_gestao_mensal kg
      WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
    ),
    
    -- KPIs de retenção
    'kpis_retencao', (
      SELECT json_agg(row_to_json(kr))
      FROM vw_kpis_retencao_mensal kr
      WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id)
    ),
    
    -- Resumo de renovações próximas
    'renovacoes_proximas', (
      SELECT json_agg(row_to_json(rp))
      FROM get_resumo_renovacoes_proximas(p_unidade_id) rp
    ),
    
    -- Lista de alunos com renovação urgente (7 dias)
    'alunos_renovacao_urgente', (
      SELECT json_agg(json_build_object(
        'aluno_nome', aluno_nome,
        'professor_nome', professor_nome,
        'curso_nome', curso_nome,
        'valor_parcela', valor_parcela,
        'dias_ate_vencimento', dias_ate_vencimento,
        'tempo_permanencia_meses', tempo_permanencia_meses,
        'telefone', telefone
      ))
      FROM vw_renovacoes_proximas
      WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
        AND status_renovacao IN ('vencido', 'urgente_7_dias')
      ORDER BY dias_ate_vencimento ASC
      LIMIT 20
    ),
    
    -- Dados do mês anterior (para comparação)
    'mes_anterior', (
      SELECT json_agg(row_to_json(dm))
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id::text = p_unidade_id::text)
        AND dm.ano = ano_anterior
        AND dm.mes = mes_anterior
    ),
    
    -- Dados do mesmo mês do ano passado (sazonalidade)
    'mesmo_mes_ano_passado', (
      SELECT json_agg(row_to_json(dm))
      FROM dados_mensais dm
      WHERE (p_unidade_id IS NULL OR dm.unidade_id::text = p_unidade_id::text)
        AND dm.ano = ano_passado
        AND dm.mes = p_mes
    ),
    
    -- Metas definidas para o período
    'metas', (
      SELECT json_agg(json_build_object(
        'unidade_id', m.unidade_id,
        'tipo', m.tipo,
        'valor', m.valor
      ))
      FROM metas m
      WHERE (p_unidade_id IS NULL OR m.unidade_id::text = p_unidade_id::text)
        AND m.ano = p_ano
        AND m.mes = p_mes
    ),
    
    -- Evasões recentes com motivos
    'evasoes_recentes', (
      SELECT json_agg(json_build_object(
        'aluno_nome', e.aluno_nome,
        'professor_nome', p.nome,
        'motivo', ms.nome,
        'tipo_saida', ts.nome,
        'valor_parcela', e.valor_parcela,
        'tempo_permanencia', e.tempo_permanencia_meses,
        'data_saida', e.data_saida
      ))
      FROM evasoes_v2 e
      LEFT JOIN professores p ON e.professor_id = p.id
      LEFT JOIN motivos_saida ms ON e.motivo_saida_id = ms.id
      LEFT JOIN tipos_saida ts ON e.tipo_saida_id = ts.id
      WHERE (p_unidade_id IS NULL OR e.unidade_id = p_unidade_id)
        AND e.data_saida >= (CURRENT_DATE - INTERVAL '30 days')
      ORDER BY e.data_saida DESC
      LIMIT 15
    ),
    
    -- Estatísticas de permanência por faixa
    'permanencia_por_faixa', (
      SELECT json_agg(json_build_object(
        'faixa', faixa,
        'quantidade', quantidade,
        'percentual', ROUND((quantidade::numeric / NULLIF(total, 0) * 100), 1)
      ))
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

-- ============================================================
-- 4. GRANTS
-- ============================================================
GRANT SELECT ON vw_renovacoes_proximas TO authenticated;
GRANT EXECUTE ON FUNCTION get_resumo_renovacoes_proximas TO authenticated;
GRANT EXECUTE ON FUNCTION get_dados_retencao_ia TO authenticated;

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
