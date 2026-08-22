-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE movimentacoes_admin
  ADD COLUMN IF NOT EXISTS emusys_matricula_id text;

CREATE INDEX IF NOT EXISTS idx_mov_admin_emusys_matricula_id
  ON movimentacoes_admin (emusys_matricula_id)
  WHERE emusys_matricula_id IS NOT NULL;

COMMENT ON COLUMN movimentacoes_admin.emusys_matricula_id IS
  'ID da matricula no Emusys (matricula.matricula_id do webhook). Usado para deduplicar renovacoes reenviadas apos edicao de cronograma. Nullable/forward-only: so preenchido a partir de 2026-07.';
