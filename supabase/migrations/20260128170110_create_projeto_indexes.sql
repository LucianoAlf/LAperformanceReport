-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_projetos_tipo ON projetos(tipo_id);
CREATE INDEX IF NOT EXISTS idx_projetos_status ON projetos(status);
CREATE INDEX IF NOT EXISTS idx_projetos_unidade ON projetos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_projeto_fases_projeto ON projeto_fases(projeto_id);
CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_fase ON projeto_tarefas(fase_id);
CREATE INDEX IF NOT EXISTS idx_projeto_tarefas_status ON projeto_tarefas(status);
