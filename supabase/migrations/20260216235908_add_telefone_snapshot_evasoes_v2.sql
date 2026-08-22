-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar coluna telefone_snapshot na evasoes_v2
ALTER TABLE evasoes_v2 ADD COLUMN IF NOT EXISTS telefone_snapshot VARCHAR(20);

-- Criar índice para busca por telefone
CREATE INDEX IF NOT EXISTS idx_evasoes_v2_telefone ON evasoes_v2(telefone_snapshot);
