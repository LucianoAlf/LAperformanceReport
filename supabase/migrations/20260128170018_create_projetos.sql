-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Projetos
CREATE TABLE IF NOT EXISTS projetos (
  id SERIAL PRIMARY KEY,
  tipo_id INTEGER NOT NULL REFERENCES projeto_tipos(id),
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'planejamento' CHECK (status IN ('planejamento', 'em_andamento', 'em_revisao', 'concluido', 'cancelado', 'pausado')),
  prioridade VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  data_inicio DATE NOT NULL,
  data_fim_prevista DATE NOT NULL,
  data_fim_real DATE,
  unidade_id UUID REFERENCES unidades(id),
  orcamento DECIMAL(10,2),
  responsavel_tipo VARCHAR(20) CHECK (responsavel_tipo IN ('usuario', 'professor')),
  responsavel_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
