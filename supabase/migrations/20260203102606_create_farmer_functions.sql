-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================
-- PAINEL FARMER - FUNCTIONS
-- ============================================

-- Função: get_rotinas_do_dia
-- Retorna as rotinas que devem aparecer para um colaborador em uma data específica
CREATE OR REPLACE FUNCTION get_rotinas_do_dia(
  p_colaborador_id INTEGER, 
  p_data DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rotina_id UUID,
  descricao VARCHAR,
  frequencia VARCHAR,
  prioridade VARCHAR,
  concluida BOOLEAN,
  execucao_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id as rotina_id,
    r.descricao,
    r.frequencia,
    r.prioridade,
    COALESCE(e.concluida, false) as concluida,
    e.id as execucao_id
  FROM farmer_rotinas r
  LEFT JOIN farmer_rotinas_execucao e ON e.rotina_id = r.id AND e.data_execucao = p_data
  WHERE r.colaborador_id = p_colaborador_id
    AND r.ativo = true
    AND (
      -- Diário: sempre aparece
      r.frequencia = 'diario'
      OR
      -- Semanal: aparece no dia da semana configurado (1=seg, 7=dom)
      (r.frequencia = 'semanal' AND EXTRACT(ISODOW FROM p_data)::INTEGER = ANY(r.dias_semana))
      OR
      -- Mensal: aparece no dia do mês configurado
      (r.frequencia = 'mensal' AND EXTRACT(DAY FROM p_data)::INTEGER = r.dia_mes)
    )
  ORDER BY 
    CASE r.prioridade WHEN 'alta' THEN 0 ELSE 1 END,
    r.descricao;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: marcar_rotina_concluida
-- Marca uma rotina como concluída (ou desmarca) para uma data
CREATE OR REPLACE FUNCTION marcar_rotina_concluida(
  p_rotina_id UUID,
  p_colaborador_id INTEGER,
  p_concluida BOOLEAN DEFAULT true,
  p_data DATE DEFAULT CURRENT_DATE
)
RETURNS UUID AS $$
DECLARE
  v_execucao_id UUID;
BEGIN
  INSERT INTO farmer_rotinas_execucao (rotina_id, colaborador_id, data_execucao, concluida, concluida_em)
  VALUES (p_rotina_id, p_colaborador_id, p_data, p_concluida, CASE WHEN p_concluida THEN NOW() ELSE NULL END)
  ON CONFLICT (rotina_id, data_execucao)
  DO UPDATE SET 
    concluida = p_concluida, 
    concluida_em = CASE WHEN p_concluida THEN NOW() ELSE NULL END
  RETURNING id INTO v_execucao_id;
  
  RETURN v_execucao_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: get_progresso_rotinas_hoje
-- Retorna o progresso das rotinas do dia para um colaborador
CREATE OR REPLACE FUNCTION get_progresso_rotinas_hoje(p_colaborador_id INTEGER)
RETURNS TABLE (
  total INTEGER,
  concluidas INTEGER,
  percentual NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total,
    COUNT(*) FILTER (WHERE COALESCE(e.concluida, false) = true)::INTEGER as concluidas,
    CASE 
      WHEN COUNT(*) > 0 
      THEN ROUND((COUNT(*) FILTER (WHERE COALESCE(e.concluida, false) = true)::NUMERIC / COUNT(*)) * 100, 0)
      ELSE 0 
    END as percentual
  FROM farmer_rotinas r
  LEFT JOIN farmer_rotinas_execucao e ON e.rotina_id = r.id AND e.data_execucao = CURRENT_DATE
  WHERE r.colaborador_id = p_colaborador_id
    AND r.ativo = true
    AND (
      r.frequencia = 'diario'
      OR (r.frequencia = 'semanal' AND EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER = ANY(r.dias_semana))
      OR (r.frequencia = 'mensal' AND EXTRACT(DAY FROM CURRENT_DATE)::INTEGER = r.dia_mes)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função: get_historico_rotinas
-- Retorna o histórico de completude das rotinas nos últimos N dias
CREATE OR REPLACE FUNCTION get_historico_rotinas(
  p_colaborador_id INTEGER,
  p_dias INTEGER DEFAULT 7
)
RETURNS TABLE (
  data DATE,
  total_rotinas INTEGER,
  rotinas_concluidas INTEGER,
  percentual NUMERIC,
  tarefas_concluidas INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH datas AS (
    SELECT generate_series(
      CURRENT_DATE - (p_dias - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date as data
  ),
  rotinas_por_dia AS (
    SELECT 
      d.data,
      COUNT(r.id) as total,
      COUNT(e.id) FILTER (WHERE e.concluida = true) as concluidas
    FROM datas d
    CROSS JOIN farmer_rotinas r
    LEFT JOIN farmer_rotinas_execucao e ON e.rotina_id = r.id AND e.data_execucao = d.data
    WHERE r.colaborador_id = p_colaborador_id
      AND r.ativo = true
      AND (
        r.frequencia = 'diario'
        OR (r.frequencia = 'semanal' AND EXTRACT(ISODOW FROM d.data)::INTEGER = ANY(r.dias_semana))
        OR (r.frequencia = 'mensal' AND EXTRACT(DAY FROM d.data)::INTEGER = r.dia_mes)
      )
    GROUP BY d.data
  ),
  tarefas_por_dia AS (
    SELECT 
      concluida_em::date as data,
      COUNT(*) as total
    FROM farmer_tarefas
    WHERE colaborador_id = p_colaborador_id
      AND concluida = true
      AND concluida_em >= CURRENT_DATE - (p_dias - 1)
    GROUP BY concluida_em::date
  )
  SELECT 
    r.data,
    r.total::INTEGER as total_rotinas,
    r.concluidas::INTEGER as rotinas_concluidas,
    CASE WHEN r.total > 0 THEN ROUND((r.concluidas::NUMERIC / r.total) * 100, 0) ELSE 0 END as percentual,
    COALESCE(t.total, 0)::INTEGER as tarefas_concluidas
  FROM rotinas_por_dia r
  LEFT JOIN tarefas_por_dia t ON t.data = r.data
  ORDER BY r.data DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários nas functions
COMMENT ON FUNCTION get_rotinas_do_dia IS 'Retorna as rotinas que devem aparecer para um colaborador em uma data específica';
COMMENT ON FUNCTION marcar_rotina_concluida IS 'Marca uma rotina como concluída (ou desmarca) para uma data';
COMMENT ON FUNCTION get_progresso_rotinas_hoje IS 'Retorna o progresso das rotinas do dia para um colaborador';
COMMENT ON FUNCTION get_historico_rotinas IS 'Retorna o histórico de completude das rotinas nos últimos N dias';
