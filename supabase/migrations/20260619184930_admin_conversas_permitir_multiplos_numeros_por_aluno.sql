-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Substitui a trava "1 conversa por aluno" por uma que permite vários números por aluno.
-- Conversas SEM número: no máximo 1 por aluno/unidade/depto (evita duplicar a principal).
-- Conversas COM número: governadas por uq_admin_conversas_jid_depto (1 por número) → permite várias por aluno.
DROP INDEX IF EXISTS idx_admin_conversas_aluno_unidade_depto;

CREATE UNIQUE INDEX idx_admin_conversas_aluno_unidade_depto_sem_jid
ON admin_conversas (aluno_id, unidade_id, departamento)
WHERE aluno_id IS NOT NULL AND whatsapp_jid IS NULL;
