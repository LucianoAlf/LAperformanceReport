-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar coluna para vincular com auth.users
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id ON usuarios(auth_user_id);

-- Comentário
COMMENT ON COLUMN usuarios.auth_user_id IS 'UUID do usuário no Supabase Auth (auth.users)';
