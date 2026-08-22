-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Template de Tarefas por Fase Template
CREATE TABLE IF NOT EXISTS projeto_tipo_tarefas_template (
  id SERIAL PRIMARY KEY,
  fase_template_id INTEGER NOT NULL REFERENCES projeto_tipo_fases_template(id) ON DELETE CASCADE,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
