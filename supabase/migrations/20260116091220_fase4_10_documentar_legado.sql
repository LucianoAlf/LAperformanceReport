-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.10: DOCUMENTAÇÃO DAS TABELAS LEGADO
-- Manter como backup por 30 dias
-- ============================================

-- Documentar tabela metas_legado
COMMENT ON TABLE metas_legado IS 'BACKUP: Tabela metas original (estrutura anual). Dados migrados para nova tabela metas em 2026-01-16. Pode ser removida após 30 dias de validação.';

-- Documentar tabela metas_comerciais (mantida como backup)
COMMENT ON TABLE metas_comerciais IS 'BACKUP: Metas comerciais originais. Dados consolidados na nova tabela metas em 2026-01-16. Pode ser removida após 30 dias de validação.';
