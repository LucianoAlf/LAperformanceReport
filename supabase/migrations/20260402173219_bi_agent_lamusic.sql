-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Config do agente BI
CREATE TABLE bi_agent_config_lamusic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT DEFAULT 'openai',
  model TEXT DEFAULT 'gpt-4o-mini',
  temperature NUMERIC DEFAULT 0.1,
  max_tokens INTEGER DEFAULT 4096,
  max_results_per_query INTEGER DEFAULT 200,
  system_prompt_override TEXT,
  cache_enabled BOOLEAN DEFAULT true,
  cache_ttl_minutes INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversas BI
CREATE TABLE bi_conversations_lamusic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mensagens BI
CREATE TABLE bi_messages_lamusic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES bi_conversations_lamusic(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT,
  sql_query TEXT,
  sql_result JSONB,
  sql_row_count INTEGER,
  visualization_type TEXT,
  visualization_config JSONB,
  tool_calls JSONB,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd NUMERIC,
  feedback_rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache de queries
CREATE TABLE bi_query_cache_lamusic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  query_hash VARCHAR(64),
  original_sql TEXT,
  result JSONB,
  row_count INTEGER,
  hit_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, query_hash)
);

-- Templates de perguntas frequentes
CREATE TABLE bi_query_templates_lamusic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  description TEXT,
  question_pattern TEXT,
  sql_template TEXT,
  default_visualization TEXT,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE bi_agent_config_lamusic ENABLE ROW LEVEL SECURITY;
ALTER TABLE bi_conversations_lamusic ENABLE ROW LEVEL SECURITY;
ALTER TABLE bi_messages_lamusic ENABLE ROW LEVEL SECURITY;
ALTER TABLE bi_query_cache_lamusic ENABLE ROW LEVEL SECURITY;
ALTER TABLE bi_query_templates_lamusic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_config_select" ON bi_agent_config_lamusic FOR SELECT USING (true);
CREATE POLICY "bi_conv_select" ON bi_conversations_lamusic FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "bi_conv_insert" ON bi_conversations_lamusic FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bi_conv_update" ON bi_conversations_lamusic FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "bi_msg_select" ON bi_messages_lamusic FOR SELECT USING (true);
CREATE POLICY "bi_msg_insert" ON bi_messages_lamusic FOR INSERT WITH CHECK (true);
CREATE POLICY "bi_msg_update" ON bi_messages_lamusic FOR UPDATE USING (true);
CREATE POLICY "bi_cache_all" ON bi_query_cache_lamusic FOR ALL USING (true);
CREATE POLICY "bi_templates_select" ON bi_query_templates_lamusic FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_bi_conv_user ON bi_conversations_lamusic(user_id);
CREATE INDEX idx_bi_msg_conv ON bi_messages_lamusic(conversation_id);
CREATE INDEX idx_bi_cache_hash ON bi_query_cache_lamusic(user_id, query_hash);

-- RPC: executar query BI com filtro de unidade obrigatório para não-admin
CREATE OR REPLACE FUNCTION execute_bi_query_lamusic(
  query_text TEXT,
  p_unidade_id UUID DEFAULT NULL,
  max_rows INTEGER DEFAULT 200
)
RETURNS JSONB AS $$
DECLARE result JSONB;
BEGIN
  IF p_unidade_id IS NOT NULL THEN
    EXECUTE format(
      'SELECT jsonb_agg(row_to_json(t)) FROM (
        SELECT * FROM (%s) sub WHERE unidade_id = %L LIMIT %s
      ) t',
      query_text, p_unidade_id, max_rows
    ) INTO result;
  ELSE
    EXECUTE format(
      'SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM (%s) sub LIMIT %s) t',
      query_text, max_rows
    ) INTO result;
  END IF;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: introspecção de schema para auto-correção
CREATE OR REPLACE FUNCTION introspect_schema_lamusic(table_names TEXT[])
RETURNS JSONB AS $$
DECLARE
  result JSONB := '[]'::jsonb;
  tbl TEXT;
  cols JSONB;
BEGIN
  FOREACH tbl IN ARRAY table_names LOOP
    SELECT jsonb_agg(jsonb_build_object(
      'column', column_name, 'type', data_type, 'nullable', is_nullable
    )) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl;
    result := result || jsonb_build_object('table', tbl, 'columns', COALESCE(cols, '[]'::jsonb));
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed: config
INSERT INTO bi_agent_config_lamusic (provider, model, temperature, max_tokens)
VALUES ('openai', 'gpt-4o-mini', 0.1, 4096);

-- Seed: templates frequentes
INSERT INTO bi_query_templates_lamusic (name, question_pattern, sql_template, default_visualization) VALUES
('Alunos ativos por unidade', 'quantos alunos (ativos|tem|temos)', 'SELECT u.codigo as unidade, COUNT(*) as alunos_ativos FROM alunos a JOIN unidades u ON u.id = a.unidade_id WHERE a.status = ''ativo'' GROUP BY u.codigo ORDER BY u.codigo', 'bar'),
('Evolução evasões', 'taxa.*(evas|churn|saida)', 'SELECT to_char(date_trunc(''month'', m.data), ''Mon/YY'') as mes, COUNT(*) as evasoes FROM movimentacoes_admin m WHERE m.tipo IN (''evasao'', ''cancelamento'') AND m.data >= CURRENT_DATE - INTERVAL ''6 months'' GROUP BY date_trunc(''month'', m.data) ORDER BY date_trunc(''month'', m.data)', 'line'),
('Leads hoje', 'leads.*(hoje|today|dia)', 'SELECT u.codigo as unidade, COUNT(*) as leads FROM leads l JOIN unidades u ON u.id = l.unidade_id WHERE l.data_contato = CURRENT_DATE AND l.arquivado = false GROUP BY u.codigo', 'bar'),
('Ranking professores por alunos', 'ranking.*(professor|prof)', 'SELECT p.nome, COUNT(a.id) as alunos FROM professores p LEFT JOIN alunos a ON a.professor_atual_id = p.id AND a.status = ''ativo'' WHERE p.ativo = true GROUP BY p.id, p.nome HAVING COUNT(a.id) > 0 ORDER BY alunos DESC LIMIT 20', 'table');
