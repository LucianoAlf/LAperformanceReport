-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 4. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_alunos_nome ON alunos(nome_normalizado);
CREATE INDEX IF NOT EXISTS idx_alunos_unidade ON alunos(unidade_id);
CREATE INDEX IF NOT EXISTS idx_alunos_professor ON alunos(professor_atual_id);
CREATE INDEX IF NOT EXISTS idx_alunos_curso ON alunos(curso_id);
CREATE INDEX IF NOT EXISTS idx_alunos_status ON alunos(status);
CREATE INDEX IF NOT EXISTS idx_alunos_classificacao ON alunos(classificacao);
CREATE INDEX IF NOT EXISTS idx_alunos_data_matricula ON alunos(data_matricula);
CREATE INDEX IF NOT EXISTS idx_alunos_data_saida ON alunos(data_saida);

-- Índices compostos para queries frequentes
CREATE INDEX IF NOT EXISTS idx_alunos_unidade_status ON alunos(unidade_id, status);
CREATE INDEX IF NOT EXISTS idx_alunos_unidade_classificacao ON alunos(unidade_id, classificacao);
