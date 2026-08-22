-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Template de Fases por Tipo de Projeto
CREATE TABLE IF NOT EXISTS projeto_tipo_fases_template (
  id SERIAL PRIMARY KEY,
  tipo_id INTEGER NOT NULL REFERENCES projeto_tipos(id) ON DELETE CASCADE,
  nome VARCHAR(100) NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 1,
  duracao_dias_sugerida INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
