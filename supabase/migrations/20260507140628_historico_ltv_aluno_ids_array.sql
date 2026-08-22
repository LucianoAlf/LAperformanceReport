-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adiciona coluna aluno_ids (array) em alunos_historico.
-- A edge function v12 grava o array completo das matriculas que compuseram
-- a passagem. A RPC get_historico_ltv usa essa coluna para evitar mostrar
-- a mesma passagem duas vezes (uma de fonte_historico, outra de fonte_sistema).

ALTER TABLE alunos_historico
  ADD COLUMN IF NOT EXISTS aluno_ids BIGINT[];

CREATE INDEX IF NOT EXISTS idx_alunos_historico_aluno_ids_gin
  ON alunos_historico USING GIN (aluno_ids)
  WHERE anulado = false;

COMMENT ON COLUMN alunos_historico.aluno_ids IS 'Array de IDs de alunos (matriculas) que compuseram a passagem. Populado pela edge v12. NULL para registros antigos pre-v12.';
