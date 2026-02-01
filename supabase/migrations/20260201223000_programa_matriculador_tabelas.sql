-- ============================================================
-- PROGRAMA MATRICULADOR+ LA 2026 - TABELAS E FUNÇÕES
-- ============================================================

-- 1. Tabela de Configurações do Programa (editável pelo admin)
CREATE TABLE IF NOT EXISTS programa_matriculador_config (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  
  -- Metas de taxas de conversão (iguais para todos)
  taxa_showup_experimental DECIMAL(5,2) NOT NULL DEFAULT 18.0,
  taxa_experimental_matricula DECIMAL(5,2) NOT NULL DEFAULT 75.0,
  taxa_lead_matricula DECIMAL(5,2) NOT NULL DEFAULT 13.5,
  
  -- Metas de volume médio por unidade (JSON)
  metas_volume JSONB NOT NULL DEFAULT '{
    "2ec861f6-023f-4d7b-9927-3960ad8c2a92": 21,
    "95553e96-971b-4590-a6eb-0201d013c14d": 17,
    "368d47f5-2d88-4475-bc14-ba084a9a348e": 14
  }'::jsonb,
  
  -- Metas de ticket médio por unidade (JSON)
  metas_ticket JSONB NOT NULL DEFAULT '{
    "2ec861f6-023f-4d7b-9927-3960ad8c2a92": 450,
    "95553e96-971b-4590-a6eb-0201d013c14d": 420,
    "368d47f5-2d88-4475-bc14-ba084a9a348e": 450
  }'::jsonb,
  
  -- Sistema de pontuação
  pontos_taxa_showup INTEGER NOT NULL DEFAULT 20,
  pontos_taxa_exp_mat INTEGER NOT NULL DEFAULT 25,
  pontos_taxa_geral INTEGER NOT NULL DEFAULT 30,
  pontos_volume INTEGER NOT NULL DEFAULT 15,
  pontos_ticket INTEGER NOT NULL DEFAULT 10,
  
  -- Nota de corte
  nota_corte INTEGER NOT NULL DEFAULT 80,
  
  -- Período do programa
  mes_inicio INTEGER NOT NULL DEFAULT 1,
  mes_fim INTEGER NOT NULL DEFAULT 11,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ano)
);

-- 2. Tabela de Penalidades Emusys
CREATE TABLE IF NOT EXISTS programa_matriculador_penalidades (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  -- Tipo de penalidade
  tipo VARCHAR(50) NOT NULL,
  descricao TEXT,
  
  -- Pontos descontados
  pontos_descontados INTEGER NOT NULL DEFAULT 3,
  
  -- Data da ocorrência
  data_ocorrencia DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Quem registrou
  registrado_por VARCHAR(100) NOT NULL,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Índices
  CONSTRAINT fk_unidade FOREIGN KEY (unidade_id) REFERENCES unidades(id)
);

CREATE INDEX IF NOT EXISTS idx_penalidades_ano_unidade 
ON programa_matriculador_penalidades(ano, unidade_id);

-- 3. Tabela de Histórico Mensal (snapshot mensal das métricas)
CREATE TABLE IF NOT EXISTS programa_matriculador_historico (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  -- Métricas do mês
  total_leads INTEGER NOT NULL DEFAULT 0,
  total_experimentais INTEGER NOT NULL DEFAULT 0,
  total_matriculas INTEGER NOT NULL DEFAULT 0,
  ticket_medio DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Taxas calculadas
  taxa_showup DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxa_exp_mat DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxa_geral DECIMAL(5,2) NOT NULL DEFAULT 0,
  
  -- Pontuação do mês (para histórico)
  pontos_mes INTEGER NOT NULL DEFAULT 0,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ano, mes, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_historico_ano_unidade 
ON programa_matriculador_historico(ano, unidade_id);

-- 4. Inserir configuração padrão para 2026
INSERT INTO programa_matriculador_config (ano)
VALUES (2026)
ON CONFLICT (ano) DO NOTHING;

-- ============================================================
-- FUNÇÕES SQL
-- ============================================================

-- Função para buscar dados do programa
CREATE OR REPLACE FUNCTION get_programa_matriculador_dados(
  p_ano INTEGER DEFAULT 2026,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
  v_hunters JSONB;
  v_penalidades JSONB;
  v_historico JSONB;
BEGIN
  -- 1. Buscar configurações do programa
  SELECT jsonb_build_object(
    'ano', c.ano,
    'metas', jsonb_build_object(
      'taxa_showup_experimental', c.taxa_showup_experimental,
      'taxa_experimental_matricula', c.taxa_experimental_matricula,
      'taxa_lead_matricula', c.taxa_lead_matricula,
      'volume_campo_grande', (c.metas_volume->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::int,
      'volume_recreio', (c.metas_volume->>'95553e96-971b-4590-a6eb-0201d013c14d')::int,
      'volume_barra', (c.metas_volume->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::int,
      'ticket_campo_grande', (c.metas_ticket->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::int,
      'ticket_recreio', (c.metas_ticket->>'95553e96-971b-4590-a6eb-0201d013c14d')::int,
      'ticket_barra', (c.metas_ticket->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::int
    ),
    'pontuacao', jsonb_build_object(
      'taxa_showup', c.pontos_taxa_showup,
      'taxa_exp_mat', c.pontos_taxa_exp_mat,
      'taxa_geral', c.pontos_taxa_geral,
      'volume_medio', c.pontos_volume,
      'ticket_medio', c.pontos_ticket
    ),
    'nota_corte', c.nota_corte,
    'periodo', jsonb_build_object(
      'mes_inicio', c.mes_inicio,
      'mes_fim', c.mes_fim
    )
  ) INTO v_config
  FROM programa_matriculador_config c
  WHERE c.ano = p_ano;
  
  -- Se não encontrou config, usar valores padrão
  IF v_config IS NULL THEN
    v_config := jsonb_build_object(
      'ano', p_ano,
      'metas', jsonb_build_object(
        'taxa_showup_experimental', 18,
        'taxa_experimental_matricula', 75,
        'taxa_lead_matricula', 13.5,
        'volume_campo_grande', 21,
        'volume_recreio', 17,
        'volume_barra', 14,
        'ticket_campo_grande', 450,
        'ticket_recreio', 420,
        'ticket_barra', 450
      ),
      'pontuacao', jsonb_build_object(
        'taxa_showup', 20,
        'taxa_exp_mat', 25,
        'taxa_geral', 30,
        'volume_medio', 15,
        'ticket_medio', 10
      ),
      'nota_corte', 80,
      'periodo', jsonb_build_object('mes_inicio', 1, 'mes_fim', 11)
    );
  END IF;

  -- 2. Buscar dados dos Hunters (métricas anuais acumuladas)
  WITH dados_anuais AS (
    SELECT 
      u.id as unidade_id,
      u.nome as unidade_nome,
      u.hunter_nome,
      COALESCE(u.hunter_apelido, u.hunter_nome) as hunter_apelido,
      -- Totais do ano
      COALESCE(SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END), 0) as total_leads,
      COALESCE(SUM(CASE WHEN ld.tipo LIKE 'experimental%' THEN ld.quantidade ELSE 0 END), 0) as total_experimentais,
      COALESCE(SUM(CASE WHEN ld.tipo = 'matricula' THEN ld.quantidade ELSE 0 END), 0) as total_matriculas,
      -- Meses com dados
      COUNT(DISTINCT EXTRACT(MONTH FROM ld.data)) as meses_com_dados
    FROM unidades u
    LEFT JOIN leads_diarios ld ON ld.unidade_id = u.id 
      AND EXTRACT(YEAR FROM ld.data) = p_ano
      AND EXTRACT(MONTH FROM ld.data) BETWEEN 1 AND 11
    WHERE u.ativo = true
      AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
    GROUP BY u.id, u.nome, u.hunter_nome, u.hunter_apelido
  ),
  ticket_medio AS (
    SELECT 
      a.unidade_id,
      COALESCE(AVG(a.valor_parcela), 0) as media_ticket
    FROM alunos a
    WHERE a.data_matricula >= (p_ano || '-01-01')::date
      AND a.data_matricula <= (p_ano || '-11-30')::date
      AND a.valor_parcela > 0
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    GROUP BY a.unidade_id
  ),
  penalidades_totais AS (
    SELECT 
      unidade_id,
      SUM(pontos_descontados) as total_pontos,
      COUNT(*) as quantidade
    FROM programa_matriculador_penalidades
    WHERE ano = p_ano
      AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    GROUP BY unidade_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'unidade_id', da.unidade_id,
      'unidade_nome', da.unidade_nome,
      'hunter_nome', da.hunter_nome,
      'hunter_apelido', da.hunter_apelido,
      'metricas', jsonb_build_object(
        'total_leads', da.total_leads,
        'total_experimentais', da.total_experimentais,
        'total_matriculas', da.total_matriculas,
        'meses_com_dados', GREATEST(da.meses_com_dados, 1),
        'media_matriculas_mes', ROUND(da.total_matriculas::numeric / GREATEST(da.meses_com_dados, 1), 1),
        'media_ticket', COALESCE(tm.media_ticket, 0),
        'taxa_showup_exp', CASE WHEN da.total_leads > 0 
          THEN ROUND((da.total_experimentais::numeric / da.total_leads) * 100, 1) 
          ELSE 0 END,
        'taxa_exp_mat', CASE WHEN da.total_experimentais > 0 
          THEN ROUND((da.total_matriculas::numeric / da.total_experimentais) * 100, 1) 
          ELSE 0 END,
        'taxa_geral', CASE WHEN da.total_leads > 0 
          THEN ROUND((da.total_matriculas::numeric / da.total_leads) * 100, 1) 
          ELSE 0 END
      ),
      'penalidades', jsonb_build_object(
        'total_pontos', COALESCE(pt.total_pontos, 0),
        'quantidade', COALESCE(pt.quantidade, 0)
      )
    )
  ) INTO v_hunters
  FROM dados_anuais da
  LEFT JOIN ticket_medio tm ON tm.unidade_id = da.unidade_id
  LEFT JOIN penalidades_totais pt ON pt.unidade_id = da.unidade_id;

  -- 3. Buscar penalidades detalhadas
  SELECT jsonb_agg(
    jsonb_build_object(
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

  -- 4. Buscar histórico mensal
  SELECT jsonb_agg(
    jsonb_build_object(
      'ano', h.ano,
      'mes', h.mes,
      'unidade_id', h.unidade_id,
      'unidade_nome', u.nome,
      'total_leads', h.total_leads,
      'total_experimentais', h.total_experimentais,
      'total_matriculas', h.total_matriculas,
      'ticket_medio', h.ticket_medio,
      'taxa_showup', h.taxa_showup,
      'taxa_exp_mat', h.taxa_exp_mat,
      'taxa_geral', h.taxa_geral,
      'pontos_mes', h.pontos_mes
    )
    ORDER BY h.mes
  ) INTO v_historico
  FROM programa_matriculador_historico h
  JOIN unidades u ON u.id = h.unidade_id
  WHERE h.ano = p_ano
    AND (p_unidade_id IS NULL OR h.unidade_id = p_unidade_id);

  -- Retornar tudo
  RETURN jsonb_build_object(
    'config', v_config,
    'hunters', COALESCE(v_hunters, '[]'::jsonb),
    'penalidades', COALESCE(v_penalidades, '[]'::jsonb),
    'historico', COALESCE(v_historico, '[]'::jsonb)
  );
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
  p_registrado_por VARCHAR(100)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO programa_matriculador_penalidades (
    ano, unidade_id, tipo, descricao, pontos_descontados, data_ocorrencia, registrado_por
  ) VALUES (
    p_ano, p_unidade_id, p_tipo, p_descricao, p_pontos, p_data_ocorrencia, p_registrado_por
  )
  RETURNING id INTO v_id;
  
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- Função para deletar penalidade
CREATE OR REPLACE FUNCTION deletar_penalidade_matriculador(p_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM programa_matriculador_penalidades WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Função para atualizar configurações
CREATE OR REPLACE FUNCTION atualizar_config_matriculador(
  p_ano INTEGER,
  p_config JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE programa_matriculador_config
  SET 
    taxa_showup_experimental = COALESCE((p_config->'metas'->>'taxa_showup_experimental')::decimal, taxa_showup_experimental),
    taxa_experimental_matricula = COALESCE((p_config->'metas'->>'taxa_experimental_matricula')::decimal, taxa_experimental_matricula),
    taxa_lead_matricula = COALESCE((p_config->'metas'->>'taxa_lead_matricula')::decimal, taxa_lead_matricula),
    nota_corte = COALESCE((p_config->>'nota_corte')::int, nota_corte),
    updated_at = NOW()
  WHERE ano = p_ano;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Função para salvar snapshot mensal (para histórico)
CREATE OR REPLACE FUNCTION salvar_historico_mensal_matriculador(
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Inserir ou atualizar histórico para cada unidade
  INSERT INTO programa_matriculador_historico (ano, mes, unidade_id, total_leads, total_experimentais, total_matriculas, ticket_medio, taxa_showup, taxa_exp_mat, taxa_geral, pontos_mes)
  SELECT 
    p_ano,
    p_mes,
    u.id,
    COALESCE(SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ld.tipo LIKE 'experimental%' THEN ld.quantidade ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ld.tipo = 'matricula' THEN ld.quantidade ELSE 0 END), 0),
    COALESCE((SELECT AVG(valor_parcela) FROM alunos WHERE unidade_id = u.id AND EXTRACT(YEAR FROM data_matricula) = p_ano AND EXTRACT(MONTH FROM data_matricula) = p_mes), 0),
    CASE WHEN SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END) > 0 
      THEN ROUND((SUM(CASE WHEN ld.tipo LIKE 'experimental%' THEN ld.quantidade ELSE 0 END)::numeric / SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END)) * 100, 1)
      ELSE 0 END,
    CASE WHEN SUM(CASE WHEN ld.tipo LIKE 'experimental%' THEN ld.quantidade ELSE 0 END) > 0 
      THEN ROUND((SUM(CASE WHEN ld.tipo = 'matricula' THEN ld.quantidade ELSE 0 END)::numeric / SUM(CASE WHEN ld.tipo LIKE 'experimental%' THEN ld.quantidade ELSE 0 END)) * 100, 1)
      ELSE 0 END,
    CASE WHEN SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END) > 0 
      THEN ROUND((SUM(CASE WHEN ld.tipo = 'matricula' THEN ld.quantidade ELSE 0 END)::numeric / SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END)) * 100, 1)
      ELSE 0 END,
    0 -- pontos_mes será calculado depois
  FROM unidades u
  LEFT JOIN leads_diarios ld ON ld.unidade_id = u.id 
    AND EXTRACT(YEAR FROM ld.data) = p_ano 
    AND EXTRACT(MONTH FROM ld.data) = p_mes
  WHERE u.ativo = true
  GROUP BY u.id
  ON CONFLICT (ano, mes, unidade_id) 
  DO UPDATE SET
    total_leads = EXCLUDED.total_leads,
    total_experimentais = EXCLUDED.total_experimentais,
    total_matriculas = EXCLUDED.total_matriculas,
    ticket_medio = EXCLUDED.ticket_medio,
    taxa_showup = EXCLUDED.taxa_showup,
    taxa_exp_mat = EXCLUDED.taxa_exp_mat,
    taxa_geral = EXCLUDED.taxa_geral,
    updated_at = NOW();
  
  RETURN jsonb_build_object('success', true, 'mes', p_mes);
END;
$$;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION get_programa_matriculador_dados TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION registrar_penalidade_matriculador TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletar_penalidade_matriculador TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION atualizar_config_matriculador TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION salvar_historico_mensal_matriculador TO authenticated, service_role;
