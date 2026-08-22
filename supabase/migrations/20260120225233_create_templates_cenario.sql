-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela para templates de cenário editáveis pelo admin
CREATE TABLE IF NOT EXISTS templates_cenario (
  id TEXT PRIMARY KEY, -- 'conservador', 'moderado', 'arrojado'
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT 'cyan',
  icone TEXT DEFAULT 'scale',
  -- Multiplicadores e ajustes
  crescimento_pct NUMERIC NOT NULL DEFAULT 10, -- % de crescimento de alunos
  churn_ajuste NUMERIC NOT NULL DEFAULT 0, -- Ajuste no churn (ex: +0.5, -1)
  conversao_ajuste_pct NUMERIC NOT NULL DEFAULT 0, -- % de ajuste nas taxas de conversão
  ticket_ajuste_pct NUMERIC NOT NULL DEFAULT 0, -- % de ajuste no ticket
  -- Score estimado
  score_estimado TEXT DEFAULT '~80%',
  -- Controle
  ativo BOOLEAN DEFAULT true,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir templates padrão
INSERT INTO templates_cenario (id, nome, descricao, cor, icone, crescimento_pct, churn_ajuste, conversao_ajuste_pct, ticket_ajuste_pct, score_estimado, ordem)
VALUES 
  ('conservador', 'Conservador', 'Crescimento seguro com metas realistas', 'emerald', 'turtle', 10, 0.5, -5, 0, '~95%', 1),
  ('moderado', 'Moderado', 'Equilíbrio entre crescimento e segurança', 'amber', 'scale', 20, 0, 0, 0, '~80%', 2),
  ('arrojado', 'Arrojado', 'Crescimento agressivo com metas desafiadoras', 'rose', 'rocket', 35, -1, 15, 5, '~60%', 3)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE templates_cenario ENABLE ROW LEVEL SECURITY;

-- Todos podem ler
CREATE POLICY "Authenticated users can read templates" ON templates_cenario
  FOR SELECT TO authenticated USING (true);

-- Apenas admins podem modificar (verificar role no app)
CREATE POLICY "Authenticated users can update templates" ON templates_cenario
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert templates" ON templates_cenario
  FOR INSERT TO authenticated WITH CHECK (true);
