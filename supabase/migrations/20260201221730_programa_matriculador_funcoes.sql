-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FUNÇÃO: Calcular dados do Programa Matriculador+ LA
-- =====================================================

CREATE OR REPLACE FUNCTION get_programa_matriculador_dados(
  p_ano INTEGER DEFAULT 2026,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSON;
  v_hunters JSON;
  v_penalidades JSON;
  v_resultado JSON;
BEGIN
  -- Buscar configurações do programa
  SELECT json_build_object(
    'ano', ano,
    'metas', json_build_object(
      'taxa_showup_experimental', meta_taxa_showup_experimental,
      'taxa_experimental_matricula', meta_taxa_experimental_matricula,
      'taxa_lead_matricula', meta_taxa_lead_matricula,
      'volume_campo_grande', meta_volume_campo_grande,
      'volume_recreio', meta_volume_recreio,
      'volume_barra', meta_volume_barra,
      'ticket_campo_grande', meta_ticket_campo_grande,
      'ticket_recreio', meta_ticket_recreio,
      'ticket_barra', meta_ticket_barra
    ),
    'pontuacao', json_build_object(
      'taxa_showup', pontos_taxa_showup,
      'taxa_exp_mat', pontos_taxa_exp_mat,
      'taxa_geral', pontos_taxa_geral,
      'volume_medio', pontos_volume_medio,
      'ticket_medio', pontos_ticket_medio
    ),
    'bonus', json_build_object(
      'taxa_showup_por_2pct', bonus_taxa_showup_por_2pct,
      'taxa_exp_mat_por_5pct', bonus_taxa_exp_mat_por_5pct,
      'taxa_geral_por_1pct', bonus_taxa_geral_por_1pct,
      'volume_por_2_acima', bonus_volume_por_2_acima,
      'ticket_por_20_acima', bonus_ticket_por_20_acima
    ),
    'penalidades', json_build_object(
      'nao_preencheu_emusys', penalidade_nao_preencheu_emusys,
      'nao_preencheu_lareport', penalidade_nao_preencheu_lareport,
      'lead_abandonado', penalidade_lead_abandonado,
      'reincidencia_mes', penalidade_reincidencia_mes
    ),
    'nota_corte', nota_corte,
    'periodo', json_build_object(
      'mes_inicio', mes_inicio,
      'mes_fim', mes_fim
    )
  ) INTO v_config
  FROM programa_matriculador_config
  WHERE ano = p_ano;

  -- Se não encontrou config, usar padrão
  IF v_config IS NULL THEN
    v_config := json_build_object(
      'ano', p_ano,
      'metas', json_build_object(
        'taxa_showup_experimental', 18.0,
        'taxa_experimental_matricula', 75.0,
        'taxa_lead_matricula', 13.5,
        'volume_campo_grande', 25,
        'volume_recreio', 20,
        'volume_barra', 15,
        'ticket_campo_grande', 387.00,
        'ticket_recreio', 435.00,
        'ticket_barra', 450.00
      ),
      'pontuacao', json_build_object(
        'taxa_showup', 20,
        'taxa_exp_mat', 25,
        'taxa_geral', 30,
        'volume_medio', 15,
        'ticket_medio', 10
      ),
      'nota_corte', 80
    );
  END IF;

  -- Buscar dados dos Hunters (métricas anuais)
  WITH dados_anuais AS (
    SELECT 
      u.id as unidade_id,
      u.nome as unidade_nome,
      CASE 
        WHEN u.nome ILIKE '%campo%' THEN 'Vitória'
        WHEN u.nome ILIKE '%recreio%' THEN 'Clayton'
        WHEN u.nome ILIKE '%barra%' THEN 'Kailane'
      END as hunter_nome,
      CASE 
        WHEN u.nome ILIKE '%campo%' THEN 'Vitórinha'
        WHEN u.nome ILIKE '%recreio%' THEN 'Cleitinho'
        WHEN u.nome ILIKE '%barra%' THEN 'Kai'
      END as hunter_apelido,
      -- Totais do ano
      COALESCE(SUM(l.total_leads), 0) as total_leads,
      COALESCE(SUM(l.experimentais_realizadas), 0) as total_experimentais,
      COALESCE(SUM(l.matriculas), 0) as total_matriculas,
      -- Contagem de meses com dados
      COUNT(DISTINCT l.mes) as meses_com_dados,
      -- Média de matrículas por mês
      CASE 
        WHEN COUNT(DISTINCT l.mes) > 0 
        THEN ROUND(COALESCE(SUM(l.matriculas), 0)::DECIMAL / COUNT(DISTINCT l.mes), 1)
        ELSE 0
      END as media_matriculas_mes,
      -- Média de ticket
      CASE 
        WHEN COUNT(DISTINCT l.mes) > 0 
        THEN ROUND(AVG(COALESCE(l.ticket_medio, 0)), 2)
        ELSE 0
      END as media_ticket
    FROM unidades u
    LEFT JOIN programa_matriculador_historico l 
      ON l.unidade_id = u.id AND l.ano = p_ano
    WHERE u.ativo = true
      AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
    GROUP BY u.id, u.nome
  ),
  -- Calcular taxas
  dados_com_taxas AS (
    SELECT 
      d.*,
      -- Taxa Show-up → Experimental (usando dados reais se disponíveis)
      CASE 
        WHEN d.total_leads > 0 
        THEN ROUND((d.total_experimentais::DECIMAL / d.total_leads) * 100, 1)
        ELSE 0
      END as taxa_showup_exp,
      -- Taxa Experimental → Matrícula
      CASE 
        WHEN d.total_experimentais > 0 
        THEN ROUND((d.total_matriculas::DECIMAL / d.total_experimentais) * 100, 1)
        ELSE 0
      END as taxa_exp_mat,
      -- Taxa Geral Lead → Matrícula
      CASE 
        WHEN d.total_leads > 0 
        THEN ROUND((d.total_matriculas::DECIMAL / d.total_leads) * 100, 1)
        ELSE 0
      END as taxa_geral
    FROM dados_anuais d
  ),
  -- Buscar penalidades
  penalidades_por_unidade AS (
    SELECT 
      unidade_id,
      COALESCE(SUM(pontos_descontados), 0) as total_penalidades,
      COUNT(*) as qtd_penalidades
    FROM programa_matriculador_penalidades
    WHERE ano = p_ano
    GROUP BY unidade_id
  )
  SELECT json_agg(
    json_build_object(
      'unidade_id', d.unidade_id,
      'unidade_nome', d.unidade_nome,
      'hunter_nome', d.hunter_nome,
      'hunter_apelido', d.hunter_apelido,
      'metricas', json_build_object(
        'total_leads', d.total_leads,
        'total_experimentais', d.total_experimentais,
        'total_matriculas', d.total_matriculas,
        'meses_com_dados', d.meses_com_dados,
        'media_matriculas_mes', d.media_matriculas_mes,
        'media_ticket', d.media_ticket,
        'taxa_showup_exp', d.taxa_showup_exp,
        'taxa_exp_mat', d.taxa_exp_mat,
        'taxa_geral', d.taxa_geral
      ),
      'penalidades', json_build_object(
        'total_pontos', COALESCE(p.total_penalidades, 0),
        'quantidade', COALESCE(p.qtd_penalidades, 0)
      )
    )
    ORDER BY d.taxa_geral DESC
  ) INTO v_hunters
  FROM dados_com_taxas d
  LEFT JOIN penalidades_por_unidade p ON p.unidade_id = d.unidade_id;

  -- Buscar histórico de penalidades
  SELECT json_agg(
    json_build_object(
      'id', p.id,
      'unidade_id', p.unidade_id,
      'unidade_nome', u.nome,
      'tipo', p.tipo,
      'descricao', p.descricao,
      'pontos_descontados', p.pontos_descontados,
      'data_ocorrencia', p.data_ocorrencia,
      'registrado_por', p.registrado_por,
      'created_at', p.created_at
    )
    ORDER BY p.data_ocorrencia DESC
  ) INTO v_penalidades
  FROM programa_matriculador_penalidades p
  JOIN unidades u ON u.id = p.unidade_id
  WHERE p.ano = p_ano
    AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id);

  -- Montar resultado final
  v_resultado := json_build_object(
    'config', v_config,
    'hunters', COALESCE(v_hunters, '[]'::json),
    'penalidades', COALESCE(v_penalidades, '[]'::json)
  );

  RETURN v_resultado;
END;
$$;

-- Função para registrar penalidade
CREATE OR REPLACE FUNCTION registrar_penalidade_matriculador(
  p_ano INTEGER,
  p_unidade_id UUID,
  p_tipo VARCHAR(50),
  p_descricao TEXT,
  p_pontos INTEGER,
  p_data_ocorrencia DATE,
  p_registrado_por TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO programa_matriculador_penalidades (
    ano, unidade_id, tipo, descricao, pontos_descontados, 
    data_ocorrencia, registrado_por
  )
  VALUES (
    p_ano, p_unidade_id, p_tipo, p_descricao, p_pontos,
    p_data_ocorrencia, p_registrado_por
  )
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'success', true,
    'id', v_id,
    'message', 'Penalidade registrada com sucesso'
  );
END;
$$;

-- Função para atualizar configurações do programa
CREATE OR REPLACE FUNCTION atualizar_config_matriculador(
  p_ano INTEGER,
  p_config JSON
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE programa_matriculador_config
  SET
    meta_taxa_showup_experimental = COALESCE((p_config->>'meta_taxa_showup_experimental')::DECIMAL, meta_taxa_showup_experimental),
    meta_taxa_experimental_matricula = COALESCE((p_config->>'meta_taxa_experimental_matricula')::DECIMAL, meta_taxa_experimental_matricula),
    meta_taxa_lead_matricula = COALESCE((p_config->>'meta_taxa_lead_matricula')::DECIMAL, meta_taxa_lead_matricula),
    meta_volume_campo_grande = COALESCE((p_config->>'meta_volume_campo_grande')::INTEGER, meta_volume_campo_grande),
    meta_volume_recreio = COALESCE((p_config->>'meta_volume_recreio')::INTEGER, meta_volume_recreio),
    meta_volume_barra = COALESCE((p_config->>'meta_volume_barra')::INTEGER, meta_volume_barra),
    meta_ticket_campo_grande = COALESCE((p_config->>'meta_ticket_campo_grande')::DECIMAL, meta_ticket_campo_grande),
    meta_ticket_recreio = COALESCE((p_config->>'meta_ticket_recreio')::DECIMAL, meta_ticket_recreio),
    meta_ticket_barra = COALESCE((p_config->>'meta_ticket_barra')::DECIMAL, meta_ticket_barra),
    pontos_taxa_showup = COALESCE((p_config->>'pontos_taxa_showup')::INTEGER, pontos_taxa_showup),
    pontos_taxa_exp_mat = COALESCE((p_config->>'pontos_taxa_exp_mat')::INTEGER, pontos_taxa_exp_mat),
    pontos_taxa_geral = COALESCE((p_config->>'pontos_taxa_geral')::INTEGER, pontos_taxa_geral),
    pontos_volume_medio = COALESCE((p_config->>'pontos_volume_medio')::INTEGER, pontos_volume_medio),
    pontos_ticket_medio = COALESCE((p_config->>'pontos_ticket_medio')::INTEGER, pontos_ticket_medio),
    nota_corte = COALESCE((p_config->>'nota_corte')::INTEGER, nota_corte),
    updated_at = NOW()
  WHERE ano = p_ano;

  IF NOT FOUND THEN
    INSERT INTO programa_matriculador_config (ano) VALUES (p_ano);
    -- Chamar recursivamente para atualizar
    RETURN atualizar_config_matriculador(p_ano, p_config);
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Configurações atualizadas com sucesso'
  );
END;
$$;

-- Função para deletar penalidade
CREATE OR REPLACE FUNCTION deletar_penalidade_matriculador(p_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM programa_matriculador_penalidades WHERE id = p_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Penalidade não encontrada');
  END IF;

  RETURN json_build_object('success', true, 'message', 'Penalidade removida com sucesso');
END;
$$;
