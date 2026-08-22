-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Tabela de etapas do pipeline (configurável pela Andreza)
CREATE TABLE crm_pipeline_etapas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  cor VARCHAR(20) DEFAULT '#6B7280',
  icone VARCHAR(10),
  ordem INTEGER NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: 10 etapas padrão do pipeline
INSERT INTO crm_pipeline_etapas (nome, slug, cor, icone, ordem) VALUES
  ('Novo Lead',              'novo_lead',              '#3B82F6', '🆕', 1),
  ('Mila (SDR Bot)',         'mila',                   '#8B5CF6', '🤖', 2),
  ('Andreza',                'andreza',                '#A855F7', '👩', 3),
  ('Em Contato',             'em_contato',             '#06B6D4', '💬', 4),
  ('Experimental Agendada',  'experimental_agendada',  '#0EA5E9', '📅', 5),
  ('Visita Agendada',        'visita_agendada',        '#14B8A6', '🏫', 6),
  ('Experimental Realizada', 'experimental_realizada', '#22C55E', '✅', 7),
  ('Visita Realizada',       'visita_realizada',       '#10B981', '✅', 8),
  ('Faltou',                 'faltou',                 '#F59E0B', '❌', 9),
  ('Matriculado',            'matriculado',            '#059669', '🎓', 10),
  ('Arquivado',              'arquivado',              '#6B7280', '📦', 11);

-- Index para ordenação
CREATE INDEX idx_crm_pipeline_etapas_ordem ON crm_pipeline_etapas(ordem) WHERE ativo = true;
