-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Equipe do Projeto
CREATE TABLE IF NOT EXISTS projeto_equipe (
  id SERIAL PRIMARY KEY,
  projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  pessoa_tipo VARCHAR(20) NOT NULL CHECK (pessoa_tipo IN ('usuario', 'professor')),
  pessoa_id INTEGER NOT NULL,
  funcao VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(projeto_id, pessoa_tipo, pessoa_id)
);
