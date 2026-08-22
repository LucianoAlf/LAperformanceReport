-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2026-08-11 — Correcao: coluna motivo de aluno_presenca_retificacoes agora aceita NULL.
--
-- A RPC app_registrar_chamada_agenda foi corrigida para nao exigir motivo
-- em retificacoes (falta->presente, etc). Mas a tabela tinha motivo NOT NULL,
-- entao o INSERT falhava com 400 Bad Request quando o motivo vinha vazio.
-- Agora a coluna aceita NULL — a retificacao e registrada sem motivo quando
-- a equipe so esta corrigindo um erro operacional.

alter table public.aluno_presenca_retificacoes 
  alter column motivo drop not null;
