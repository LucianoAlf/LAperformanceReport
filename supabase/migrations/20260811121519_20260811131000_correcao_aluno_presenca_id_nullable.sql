-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2026-08-11 — Correção: aluno_presenca_id em aluno_presenca_retificacoes aceita NULL.
--
-- A FK é ON DELETE SET NULL (quando a presença é deletada pelo toggle,
-- a retificação perde a referência mas continua existindo para auditoria).
-- Mas a coluna era NOT NULL, então o SET NULL falhava com 400 Bad Request.
--
-- A coluna agora aceita NULL. A retificação preserva o histórico de
-- auditoria (status_anterior, status_novo, respondido_por_anterior, etc.)
-- mesmo sem a referência direta ao registro deletado.

alter table public.aluno_presenca_retificacoes
  alter column aluno_presenca_id drop not null;
