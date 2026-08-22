-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Índice parcial para queries de KPIs que filtram status + is_segundo_curso
-- Cobre: contagem ativos, pagantes, bolsistas, ticket médio
CREATE INDEX IF NOT EXISTS idx_alunos_status_segundo_curso 
ON alunos (unidade_id, status, tipo_matricula_id) 
WHERE status IN ('ativo', 'trancado') AND (is_segundo_curso IS NULL OR is_segundo_curso = false);

-- Índice para anotações pendentes (usado na listagem de alunos)
CREATE INDEX IF NOT EXISTS idx_anotacoes_alunos_pendentes 
ON anotacoes_alunos (aluno_id, created_at DESC) 
WHERE resolvido = false;

-- Índice para turmas_alunos (elimina scan completo no N+1 fix)
CREATE INDEX IF NOT EXISTS idx_turmas_alunos_turma_id 
ON turmas_alunos (turma_id);
