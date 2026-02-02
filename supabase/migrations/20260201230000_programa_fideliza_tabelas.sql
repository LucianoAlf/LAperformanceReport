-- ============================================================
-- PROGRAMA FIDELIZA+ LA 2026 - TABELAS E FUNÇÕES
-- Competição trimestral para Farmers (duplas de retenção)
-- ============================================================

-- 1. Tabela de Configurações do Programa Fideliza+
CREATE TABLE IF NOT EXISTS programa_fideliza_config (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  
  -- Metas de Retenção (trimestrais)
  meta_churn_maximo DECIMAL(5,2) NOT NULL DEFAULT 4.0,        -- Churn Premiado ≤ 4%
  meta_inadimplencia_maxima DECIMAL(5,2) NOT NULL DEFAULT 1.0, -- Inadimplência ≤ 1%
  meta_renovacao_minima DECIMAL(5,2) NOT NULL DEFAULT 90.0,    -- Max Renovação ≥ 90%
  meta_reajuste_minimo DECIMAL(5,2) NOT NULL DEFAULT 7.0,      -- Reajuste Campeão ≥ 7%
  
  -- Metas de Lojinha por unidade (JSON) - valores trimestrais
  metas_lojinha JSONB NOT NULL DEFAULT '{
    "2ec861f6-023f-4d7b-9927-3960ad8c2a92": 5000,
    "95553e96-971b-4590-a6eb-0201d013c14d": 3000,
    "368d47f5-2d88-4475-bc14-ba084a9a348e": 3000
  }'::jsonb,
  
  -- Sistema de pontuação (por critério batido)
  pontos_churn INTEGER NOT NULL DEFAULT 25,
  pontos_inadimplencia INTEGER NOT NULL DEFAULT 20,
  pontos_renovacao INTEGER NOT NULL DEFAULT 25,
  pontos_reajuste INTEGER NOT NULL DEFAULT 15,
  pontos_lojinha INTEGER NOT NULL DEFAULT 15,
  
  -- Penalidades
  penalidade_nao_preencheu_sistema INTEGER NOT NULL DEFAULT 3,
  penalidade_nao_preencheu_lareport INTEGER NOT NULL DEFAULT 3,
  penalidade_reincidencia_mes INTEGER NOT NULL DEFAULT 5,
  
  -- Nota de corte para premiação
  nota_corte INTEGER NOT NULL DEFAULT 60,
  
  -- Critério de desempate anual
  criterio_desempate VARCHAR(50) NOT NULL DEFAULT 'menor_churn',
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ano)
);

-- 2. Tabela de Penalidades do Fideliza+
CREATE TABLE IF NOT EXISTS programa_fideliza_penalidades (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL DEFAULT 2026,
  trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
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
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fideliza_penalidades_ano_trim 
ON programa_fideliza_penalidades(ano, trimestre, unidade_id);

-- 3. Tabela de Histórico Trimestral (snapshot das métricas)
CREATE TABLE IF NOT EXISTS programa_fideliza_historico (
  id SERIAL PRIMARY KEY,
  ano INTEGER NOT NULL,
  trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  
  -- Métricas do trimestre
  churn_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  inadimplencia_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  taxa_renovacao DECIMAL(5,2) NOT NULL DEFAULT 0,
  reajuste_medio DECIMAL(5,2) NOT NULL DEFAULT 0,
  vendas_lojinha DECIMAL(10,2) NOT NULL DEFAULT 0,
  
  -- Critérios batidos (para facilitar consultas)
  bateu_churn BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_inadimplencia BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_renovacao BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_reajuste BOOLEAN NOT NULL DEFAULT FALSE,
  bateu_lojinha BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Pontuação do trimestre
  pontos_base INTEGER NOT NULL DEFAULT 0,
  pontos_bonus INTEGER NOT NULL DEFAULT 0,
  pontos_penalidades INTEGER NOT NULL DEFAULT 0,
  pontos_total INTEGER NOT NULL DEFAULT 0,
  
  -- Posição no ranking
  posicao INTEGER,
  
  -- Tipo de experiência desbloqueada
  experiencia_tipo VARCHAR(20), -- 'premium', 'standard', null
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(ano, trimestre, unidade_id)
);

CREATE INDEX IF NOT EXISTS idx_fideliza_historico_ano_trim 
ON programa_fideliza_historico(ano, trimestre);

-- 4. Tabela de Experiências (prêmios cadastráveis)
CREATE TABLE IF NOT EXISTS programa_fideliza_experiencias (
  id SERIAL PRIMARY KEY,
  
  -- Tipo: standard (4/5 critérios) ou premium (5/5 critérios)
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('standard', 'premium')),
  
  -- Dados da experiência
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  emoji VARCHAR(10),
  valor_estimado DECIMAL(10,2),
  
  -- Status
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- 5. Inserir configuração padrão para 2026
INSERT INTO programa_fideliza_config (ano)
VALUES (2026)
ON CONFLICT (ano) DO NOTHING;

-- 6. Inserir experiências padrão
INSERT INTO programa_fideliza_experiencias (tipo, nome, descricao, emoji, valor_estimado) VALUES
-- Standard
('standard', 'Cinema + Pipoca', 'Ingresso + combo para 2 pessoas', '🍿', 100),
('standard', 'Jantar Casual', 'Vale R$150 em restaurante parceiro', '🍕', 150),
('standard', 'Experiência Gamer', '2h em arena de games', '🎮', 120),
-- Premium
('premium', 'Jantar Gastronômico', 'Experiência em restaurante premium para 2', '🍽️', 400),
('premium', 'Teatro/Show', 'Ingressos para espetáculo + jantar', '🎭', 500),
('premium', 'Day Use Resort', 'Dia em resort com acompanhante', '🏖️', 600)
ON CONFLICT DO NOTHING;

-- ============================================================
-- FUNÇÕES SQL
-- ============================================================

-- Função para buscar dados do programa Fideliza+
CREATE OR REPLACE FUNCTION get_programa_fideliza_dados(
  p_ano INTEGER DEFAULT 2026,
  p_trimestre INTEGER DEFAULT NULL,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
  v_farmers JSONB;
  v_penalidades JSONB;
  v_historico JSONB;
  v_experiencias JSONB;
  v_trim_atual INTEGER;
BEGIN
  -- Calcular trimestre atual se não informado
  IF p_trimestre IS NULL THEN
    v_trim_atual := CEIL(EXTRACT(MONTH FROM CURRENT_DATE)::numeric / 3);
  ELSE
    v_trim_atual := p_trimestre;
  END IF;

  -- 1. Buscar configurações do programa
  SELECT jsonb_build_object(
    'ano', c.ano,
    'metas', jsonb_build_object(
      'churn_maximo', c.meta_churn_maximo,
      'inadimplencia_maxima', c.meta_inadimplencia_maxima,
      'renovacao_minima', c.meta_renovacao_minima,
      'reajuste_minimo', c.meta_reajuste_minimo,
      'lojinha_campo_grande', (c.metas_lojinha->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::numeric,
      'lojinha_recreio', (c.metas_lojinha->>'95553e96-971b-4590-a6eb-0201d013c14d')::numeric,
      'lojinha_barra', (c.metas_lojinha->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::numeric
    ),
    'pontuacao', jsonb_build_object(
      'churn', c.pontos_churn,
      'inadimplencia', c.pontos_inadimplencia,
      'renovacao', c.pontos_renovacao,
      'reajuste', c.pontos_reajuste,
      'lojinha', c.pontos_lojinha
    ),
    'penalidades', jsonb_build_object(
      'nao_preencheu_sistema', c.penalidade_nao_preencheu_sistema,
      'nao_preencheu_lareport', c.penalidade_nao_preencheu_lareport,
      'reincidencia_mes', c.penalidade_reincidencia_mes
    ),
    'nota_corte', c.nota_corte,
    'criterio_desempate', c.criterio_desempate
  ) INTO v_config
  FROM programa_fideliza_config c
  WHERE c.ano = p_ano;
  
  -- Se não encontrou config, usar valores padrão
  IF v_config IS NULL THEN
    v_config := jsonb_build_object(
      'ano', p_ano,
      'metas', jsonb_build_object(
        'churn_maximo', 4,
        'inadimplencia_maxima', 1,
        'renovacao_minima', 90,
        'reajuste_minimo', 7,
        'lojinha_campo_grande', 5000,
        'lojinha_recreio', 3000,
        'lojinha_barra', 3000
      ),
      'pontuacao', jsonb_build_object(
        'churn', 25,
        'inadimplencia', 20,
        'renovacao', 25,
        'reajuste', 15,
        'lojinha', 15
      ),
      'penalidades', jsonb_build_object(
        'nao_preencheu_sistema', 3,
        'nao_preencheu_lareport', 3,
        'reincidencia_mes', 5
      ),
      'nota_corte', 60,
      'criterio_desempate', 'menor_churn'
    );
  END IF;

  -- 2. Buscar dados dos Farmers (duplas por unidade)
  WITH metricas_trimestre AS (
    SELECT 
      u.id as unidade_id,
      u.nome as unidade_nome,
      -- Calcular métricas do trimestre atual
      -- Churn: média dos 3 meses do trimestre
      COALESCE(AVG(dm.churn_rate), 0) as churn_rate,
      -- Inadimplência: média dos 3 meses
      COALESCE(AVG(dm.inadimplencia), 0) as inadimplencia_pct,
      -- Taxa de renovação: média dos 3 meses
      COALESCE(AVG(dm.taxa_renovacao), 0) as taxa_renovacao,
      -- Reajuste médio: média dos 3 meses
      COALESCE(AVG(dm.reajuste_parcelas), 0) as reajuste_medio
    FROM unidades u
    LEFT JOIN dados_mensais dm ON dm.unidade_id = u.id 
      AND dm.ano = p_ano
      AND dm.mes BETWEEN ((v_trim_atual - 1) * 3 + 1) AND (v_trim_atual * 3)
    WHERE u.ativo = true
      AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
    GROUP BY u.id, u.nome
  ),
  penalidades_totais AS (
    SELECT 
      unidade_id,
      SUM(pontos_descontados) as total_pontos,
      COUNT(*) as quantidade
    FROM programa_fideliza_penalidades
    WHERE ano = p_ano
      AND trimestre = v_trim_atual
      AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    GROUP BY unidade_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'unidade_id', mt.unidade_id,
      'unidade_nome', mt.unidade_nome,
      'farmers', CASE mt.unidade_id
        WHEN '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid THEN jsonb_build_object('nomes', 'Gabriela e Jhonatan', 'apelidos', 'Gabi & Jhon')
        WHEN '95553e96-971b-4590-a6eb-0201d013c14d'::uuid THEN jsonb_build_object('nomes', 'Fernanda e Daiana', 'apelidos', 'Fefê & Dai')
        WHEN '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid THEN jsonb_build_object('nomes', 'Eduarda e Arthur', 'apelidos', 'Duda & Arthur')
        ELSE jsonb_build_object('nomes', 'Equipe', 'apelidos', 'Equipe')
      END,
      'metricas', jsonb_build_object(
        'churn_rate', ROUND(mt.churn_rate::numeric, 2),
        'inadimplencia_pct', ROUND(mt.inadimplencia_pct::numeric, 2),
        'taxa_renovacao', ROUND(mt.taxa_renovacao::numeric, 2),
        'reajuste_medio', ROUND(mt.reajuste_medio::numeric, 2),
        'vendas_lojinha', 0 -- TODO: integrar com tabela de lojinha quando criada
      ),
      'penalidades', jsonb_build_object(
        'total_pontos', COALESCE(pt.total_pontos, 0),
        'quantidade', COALESCE(pt.quantidade, 0)
      )
    )
  ) INTO v_farmers
  FROM metricas_trimestre mt
  LEFT JOIN penalidades_totais pt ON pt.unidade_id = mt.unidade_id;

  -- 3. Buscar penalidades detalhadas
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'unidade_id', p.unidade_id,
      'unidade_nome', u.nome,
      'trimestre', p.trimestre,
      'tipo', p.tipo,
      'descricao', p.descricao,
      'pontos_descontados', p.pontos_descontados,
      'data_ocorrencia', p.data_ocorrencia,
      'registrado_por', p.registrado_por,
      'created_at', p.created_at
    )
    ORDER BY p.data_ocorrencia DESC
  ) INTO v_penalidades
  FROM programa_fideliza_penalidades p
  JOIN unidades u ON u.id = p.unidade_id
  WHERE p.ano = p_ano
    AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id);

  -- 4. Buscar histórico trimestral
  SELECT jsonb_agg(
    jsonb_build_object(
      'ano', h.ano,
      'trimestre', h.trimestre,
      'unidade_id', h.unidade_id,
      'unidade_nome', u.nome,
      'churn_rate', h.churn_rate,
      'inadimplencia_pct', h.inadimplencia_pct,
      'taxa_renovacao', h.taxa_renovacao,
      'reajuste_medio', h.reajuste_medio,
      'vendas_lojinha', h.vendas_lojinha,
      'bateu_churn', h.bateu_churn,
      'bateu_inadimplencia', h.bateu_inadimplencia,
      'bateu_renovacao', h.bateu_renovacao,
      'bateu_reajuste', h.bateu_reajuste,
      'bateu_lojinha', h.bateu_lojinha,
      'pontos_total', h.pontos_total,
      'posicao', h.posicao,
      'experiencia_tipo', h.experiencia_tipo
    )
    ORDER BY h.trimestre
  ) INTO v_historico
  FROM programa_fideliza_historico h
  JOIN unidades u ON u.id = h.unidade_id
  WHERE h.ano = p_ano
    AND (p_unidade_id IS NULL OR h.unidade_id = p_unidade_id);

  -- 5. Buscar experiências
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'tipo', e.tipo,
      'nome', e.nome,
      'descricao', e.descricao,
      'emoji', e.emoji,
      'valor_estimado', e.valor_estimado
    )
    ORDER BY e.tipo, e.nome
  ) INTO v_experiencias
  FROM programa_fideliza_experiencias e
  WHERE e.ativo = true;

  -- Retornar tudo
  RETURN jsonb_build_object(
    'config', v_config,
    'trimestre_atual', v_trim_atual,
    'farmers', COALESCE(v_farmers, '[]'::jsonb),
    'penalidades', COALESCE(v_penalidades, '[]'::jsonb),
    'historico', COALESCE(v_historico, '[]'::jsonb),
    'experiencias', COALESCE(v_experiencias, '[]'::jsonb)
  );
END;
$$;

-- Função para registrar penalidade Fideliza+
CREATE OR REPLACE FUNCTION registrar_penalidade_fideliza(
  p_ano INTEGER,
  p_trimestre INTEGER,
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
  INSERT INTO programa_fideliza_penalidades (
    ano, trimestre, unidade_id, tipo, descricao, pontos_descontados, data_ocorrencia, registrado_por
  ) VALUES (
    p_ano, p_trimestre, p_unidade_id, p_tipo, p_descricao, p_pontos, p_data_ocorrencia, p_registrado_por
  )
  RETURNING id INTO v_id;
  
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- Função para deletar penalidade Fideliza+
CREATE OR REPLACE FUNCTION deletar_penalidade_fideliza(p_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM programa_fideliza_penalidades WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Função para atualizar configurações Fideliza+
CREATE OR REPLACE FUNCTION atualizar_config_fideliza(
  p_ano INTEGER,
  p_campo VARCHAR(100),
  p_valor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE programa_fideliza_config SET %I = $1, updated_at = NOW() WHERE ano = $2',
    p_campo
  ) USING p_valor, p_ano;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Função para salvar snapshot trimestral
CREATE OR REPLACE FUNCTION salvar_historico_trimestral_fideliza(
  p_ano INTEGER,
  p_trimestre INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config programa_fideliza_config%ROWTYPE;
BEGIN
  -- Buscar config
  SELECT * INTO v_config FROM programa_fideliza_config WHERE ano = p_ano;
  
  -- Inserir ou atualizar histórico para cada unidade
  INSERT INTO programa_fideliza_historico (
    ano, trimestre, unidade_id, 
    churn_rate, inadimplencia_pct, taxa_renovacao, reajuste_medio, vendas_lojinha,
    bateu_churn, bateu_inadimplencia, bateu_renovacao, bateu_reajuste, bateu_lojinha,
    pontos_base, pontos_penalidades, pontos_total
  )
  SELECT 
    p_ano,
    p_trimestre,
    u.id,
    COALESCE(AVG(dm.churn_rate), 0),
    COALESCE(AVG(dm.inadimplencia), 0),
    COALESCE(AVG(dm.taxa_renovacao), 0),
    COALESCE(AVG(dm.reajuste_parcelas), 0),
    0, -- vendas_lojinha - TODO: integrar
    COALESCE(AVG(dm.churn_rate), 100) <= v_config.meta_churn_maximo,
    COALESCE(AVG(dm.inadimplencia), 100) <= v_config.meta_inadimplencia_maxima,
    COALESCE(AVG(dm.taxa_renovacao), 0) >= v_config.meta_renovacao_minima,
    COALESCE(AVG(dm.reajuste_parcelas), 0) >= v_config.meta_reajuste_minimo,
    FALSE, -- bateu_lojinha - TODO: integrar
    -- Calcular pontos base
    (CASE WHEN COALESCE(AVG(dm.churn_rate), 100) <= v_config.meta_churn_maximo THEN v_config.pontos_churn ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.inadimplencia), 100) <= v_config.meta_inadimplencia_maxima THEN v_config.pontos_inadimplencia ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.taxa_renovacao), 0) >= v_config.meta_renovacao_minima THEN v_config.pontos_renovacao ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.reajuste_parcelas), 0) >= v_config.meta_reajuste_minimo THEN v_config.pontos_reajuste ELSE 0 END),
    -- Penalidades
    COALESCE((SELECT SUM(pontos_descontados) FROM programa_fideliza_penalidades WHERE ano = p_ano AND trimestre = p_trimestre AND unidade_id = u.id), 0),
    -- Total
    (CASE WHEN COALESCE(AVG(dm.churn_rate), 100) <= v_config.meta_churn_maximo THEN v_config.pontos_churn ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.inadimplencia), 100) <= v_config.meta_inadimplencia_maxima THEN v_config.pontos_inadimplencia ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.taxa_renovacao), 0) >= v_config.meta_renovacao_minima THEN v_config.pontos_renovacao ELSE 0 END) +
    (CASE WHEN COALESCE(AVG(dm.reajuste_parcelas), 0) >= v_config.meta_reajuste_minimo THEN v_config.pontos_reajuste ELSE 0 END) -
    COALESCE((SELECT SUM(pontos_descontados) FROM programa_fideliza_penalidades WHERE ano = p_ano AND trimestre = p_trimestre AND unidade_id = u.id), 0)
  FROM unidades u
  LEFT JOIN dados_mensais dm ON dm.unidade_id = u.id 
    AND dm.ano = p_ano
    AND dm.mes BETWEEN ((p_trimestre - 1) * 3 + 1) AND (p_trimestre * 3)
  WHERE u.ativo = true
  GROUP BY u.id
  ON CONFLICT (ano, trimestre, unidade_id) 
  DO UPDATE SET
    churn_rate = EXCLUDED.churn_rate,
    inadimplencia_pct = EXCLUDED.inadimplencia_pct,
    taxa_renovacao = EXCLUDED.taxa_renovacao,
    reajuste_medio = EXCLUDED.reajuste_medio,
    vendas_lojinha = EXCLUDED.vendas_lojinha,
    bateu_churn = EXCLUDED.bateu_churn,
    bateu_inadimplencia = EXCLUDED.bateu_inadimplencia,
    bateu_renovacao = EXCLUDED.bateu_renovacao,
    bateu_reajuste = EXCLUDED.bateu_reajuste,
    bateu_lojinha = EXCLUDED.bateu_lojinha,
    pontos_base = EXCLUDED.pontos_base,
    pontos_penalidades = EXCLUDED.pontos_penalidades,
    pontos_total = EXCLUDED.pontos_total,
    updated_at = NOW();
  
  -- Atualizar posições
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY pontos_total DESC, churn_rate ASC) as pos
    FROM programa_fideliza_historico
    WHERE ano = p_ano AND trimestre = p_trimestre
  )
  UPDATE programa_fideliza_historico h
  SET posicao = r.pos
  FROM ranked r
  WHERE h.id = r.id;
  
  -- Atualizar tipo de experiência
  UPDATE programa_fideliza_historico
  SET experiencia_tipo = CASE 
    WHEN bateu_churn AND bateu_inadimplencia AND bateu_renovacao AND bateu_reajuste AND bateu_lojinha THEN 'premium'
    WHEN (bateu_churn::int + bateu_inadimplencia::int + bateu_renovacao::int + bateu_reajuste::int + bateu_lojinha::int) >= 4 THEN 'standard'
    ELSE NULL
  END
  WHERE ano = p_ano AND trimestre = p_trimestre;
  
  RETURN jsonb_build_object('success', true, 'trimestre', p_trimestre);
END;
$$;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION get_programa_fideliza_dados TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION registrar_penalidade_fideliza TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletar_penalidade_fideliza TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION atualizar_config_fideliza TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION salvar_historico_trimestral_fideliza TO authenticated, service_role;

-- Permissões nas tabelas
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_config TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_penalidades TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_historico TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON programa_fideliza_experiencias TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
