-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RLS Policies
ALTER TABLE projeto_tipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_tipo_fases_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_tipo_tarefas_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_fases ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_tarefas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projeto_equipe ENABLE ROW LEVEL SECURITY;
