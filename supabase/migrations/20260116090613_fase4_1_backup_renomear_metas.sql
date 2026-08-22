-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.1: BACKUP E PREPARAÇÃO
-- Renomear tabela metas existente para preservar dados
-- ============================================

-- Renomear tabela metas para metas_legado
ALTER TABLE metas RENAME TO metas_legado;

-- Comentário para documentação
COMMENT ON TABLE metas_legado IS 'Backup da tabela metas original (estrutura anual). Dados migrados para nova tabela metas em 2026-01-16.';
