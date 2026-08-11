-- 2026-08-11 — Correção: CHECK constraints de aluno_presenca_retificacoes.
--
-- Dois problemas impediam o toggle (desmarcar):
--
-- 1. status_novo CHECK só permitia 'presente'/'falta'/'falta_justificada'.
--    O toggle envia 'indeterminado' → violava o CHECK → 400 Bad Request.
--
-- 2. motivo CHECK exigia length >= 3. Mas a retificação sem motivo (toggle)
--    envia motivo = NULL → violava o CHECK → 400 Bad Request.
--
-- Correção:
--   - status_novo: adiciona 'indeterminado' ao CHECK
--   - motivo: remove o CHECK (a coluna já é nullable desde a migration anterior)
--   - aluno_presenca_id: agora aceita NULL (ON DELETE SET NULL)

alter table public.aluno_presenca_retificacoes
  drop constraint aluno_presenca_retificacoes_status_novo_check;

alter table public.aluno_presenca_retificacoes
  add constraint aluno_presenca_retificacoes_status_novo_check
  check (status_novo in ('presente', 'falta', 'falta_justificada', 'indeterminado'));

alter table public.aluno_presenca_retificacoes
  drop constraint aluno_presenca_retificacoes_motivo_check;

alter table public.aluno_presenca_retificacoes
  alter column aluno_presenca_id drop not null;
