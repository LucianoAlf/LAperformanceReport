-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE TABLE IF NOT EXISTS professor_360_avaliacoes (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER NOT NULL REFERENCES professores(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES unidades(id),
  competencia VARCHAR(7) NOT NULL,
  pontos_atrasos INTEGER DEFAULT 100,
  pontos_faltas INTEGER DEFAULT 100,
  pontos_organizacao_sala INTEGER DEFAULT 100,
  pontos_uniforme INTEGER DEFAULT 100,
  pontos_prazos INTEGER DEFAULT 100,
  pontos_emusys INTEGER DEFAULT 100,
  pontos_projetos INTEGER DEFAULT 0,
  qtd_atrasos INTEGER DEFAULT 0,
  qtd_faltas INTEGER DEFAULT 0,
  qtd_organizacao_sala INTEGER DEFAULT 0,
  qtd_uniforme INTEGER DEFAULT 0,
  qtd_prazos INTEGER DEFAULT 0,
  qtd_emusys INTEGER DEFAULT 0,
  qtd_projetos INTEGER DEFAULT 0,
  nota_base DECIMAL(5,2) DEFAULT 100,
  bonus_projetos DECIMAL(5,2) DEFAULT 0,
  nota_final DECIMAL(5,2) DEFAULT 100,
  status VARCHAR(20) DEFAULT 'pendente',
  avaliador_id TEXT,
  data_fechamento TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(professor_id, unidade_id, competencia)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_professor ON professor_360_avaliacoes(professor_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_competencia ON professor_360_avaliacoes(competencia);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_unidade ON professor_360_avaliacoes(unidade_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON professor_360_avaliacoes(status);
