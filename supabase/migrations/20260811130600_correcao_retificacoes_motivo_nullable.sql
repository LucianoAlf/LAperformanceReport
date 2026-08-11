-- 2026-08-11 — Correção: coluna motivo de aluno_presenca_retificacoes agora aceita NULL.
--
-- A RPC app_registrar_chamada_agenda foi corrigida para não exigir motivo
-- em retificações (falta->presente, etc). Mas a tabela tinha motivo NOT NULL,
-- então o INSERT falhava com 400 Bad Request quando o motivo vinha vazio.
-- Agora a coluna aceita NULL — a retificação é registrada sem motivo quando
-- a equipe só está corrigindo um erro operacional.

alter table public.aluno_presenca_retificacoes
  alter column motivo drop not null;
