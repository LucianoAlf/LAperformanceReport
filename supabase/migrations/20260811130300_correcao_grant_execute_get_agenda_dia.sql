-- 2026-08-11 — Correcao: get_agenda_dia perdeu GRANT EXECUTE apos drop+create.
--
-- A migration 20260811130100_agenda_dia_campos_chamada.sql fez
-- `drop function if exists public.get_agenda_dia(date, uuid);` seguido de
-- `create or replace function`. O DROP descarta os grants EXECUTE da funcao,
-- e o CREATE nao os recupera — toda migration anterior que fazia drop
-- (20260802145946, 20260804191732) inclua revoke+grant no fim. Esta aqui
-- esqueceu, e o resultado foi 403 Forbidden em todas as chamadas da Agenda.
--
-- Sintoma: POST /rest/v1/rpc/get_agenda_dia retorna 403 para authenticated.
-- Causa: `authenticated` nao tem EXECUTE na funcao recriada.
-- Correcao: re-grants no padrao das migrations anteriores (revoke de
-- public/anon, grant para authenticated + service_role).

revoke all on function public.get_agenda_dia(date, uuid) from public;
revoke all on function public.get_agenda_dia(date, uuid) from anon;
grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
grant execute on function public.get_agenda_dia(date, uuid) to service_role;
