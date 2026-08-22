-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE alunos ADD COLUMN IF NOT EXISTS emusys_matricula_id text;

CREATE INDEX IF NOT EXISTS idx_alunos_emusys_matricula_id
  ON alunos(emusys_matricula_id)
  WHERE emusys_matricula_id IS NOT NULL;

COMMENT ON COLUMN alunos.emusys_matricula_id IS 'ID da matricula no Emusys (body.matricula.matricula_id do webhook). Populado automaticamente pela edge function processar-matricula-emusys ao processar webhook. Permite match exato entre webhook e aluno em casos de nome duplicado (matricula principal vs segundo curso).';
