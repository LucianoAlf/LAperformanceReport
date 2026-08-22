-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar coluna unidade_acao para indicar onde a ação será realizada
ALTER TABLE professor_acoes 
ADD COLUMN IF NOT EXISTS unidade_acao VARCHAR(50);

-- Comentário explicativo
COMMENT ON COLUMN professor_acoes.unidade_acao IS 'Local onde a ação será realizada: campo_grande, recreio, barra, online';
