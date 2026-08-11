-- 2026-08-11 — Correção: FK de retificações agora é ON DELETE SET NULL.
--
-- A RPC app_registrar_chamada_agenda com status='indeterminado' faz:
--   1. INSERT em aluno_presenca_retificacoes (auditoria)
--   2. DELETE de aluno_presenca
--
-- A FK era ON DELETE NO ACTION, então o DELETE falhava porque a
-- retificação acabou de ser criada apontando para o registro. O Postgres
-- rejeita com 400 Bad Request.
--
-- Agora ON DELETE SET NULL: o histórico de auditoria é preservado (a
-- retificação continua existindo), só perde a referência direta ao
-- registro deletado — o que faz sentido porque o registro foi removido
-- (o aluno voltou ao estado natural sem destino).

alter table public.aluno_presenca_retificacoes
  drop constraint aluno_presenca_retificacoes_aluno_presenca_id_fkey;

alter table public.aluno_presenca_retificacoes
  add constraint aluno_presenca_retificacoes_aluno_presenca_id_fkey
  foreign key (aluno_presenca_id)
  references public.aluno_presenca(id)
  on delete set null;

-- Mesma coisa para revisoes_operacionais
alter table public.aluno_presenca_revisoes_operacionais
  drop constraint aluno_presenca_revisoes_operacionais_aluno_presenca_id_fkey;

alter table public.aluno_presenca_revisoes_operacionais
  add constraint aluno_presenca_revisoes_operacionais_aluno_presenca_id_fkey
  foreign key (aluno_presenca_id)
  references public.aluno_presenca(id)
  on delete set null;
