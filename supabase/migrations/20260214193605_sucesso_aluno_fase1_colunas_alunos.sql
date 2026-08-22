-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- 7. ADICIONAR COLUNA health_score_numerico NA TABELA alunos
-- Score numérico 0-100 (a coluna varchar existente é mantida para compatibilidade)
-- =====================================================
ALTER TABLE alunos 
ADD COLUMN IF NOT EXISTS health_score_numerico INTEGER DEFAULT NULL;

COMMENT ON COLUMN alunos.health_score_numerico IS 'Health Score numérico 0-100 calculado automaticamente';
