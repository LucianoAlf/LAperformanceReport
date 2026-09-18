-- Fecha a superficie publica de helpers/gatilhos e cobre as FKs da projecao.
-- Funcoes de trigger continuam sendo chamadas pelo banco; nao precisam de EXECUTE
-- para anon, authenticated ou service_role.

create index if not exists idx_eventos_operacionais_aluno_id
  on public.eventos_operacionais (aluno_id);
create index if not exists idx_eventos_operacionais_aula_id
  on public.eventos_operacionais (aula_id);
create index if not exists idx_eventos_operacionais_unidade_id
  on public.eventos_operacionais (unidade_id);

revoke all on function public.fn_eventos_operacionais_origem(text)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_na_janela_aula(timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_timestamptz(text)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_aluno_da_aula(integer, uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_eventos_operacionais_registrar(
  text, text, timestamptz, text, uuid, integer, text, integer, text,
  jsonb, jsonb, text, text, jsonb
) from public, anon, authenticated, service_role;

revoke all on function public.trg_eventos_operacionais_aula_reagendada()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_aula_cancelada()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_professor_aula()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_professor_jornada()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_jornada_matricula()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_aviso_previo()
  from public, anon, authenticated, service_role;
revoke all on function public.trg_eventos_operacionais_experimental()
  from public, anon, authenticated, service_role;

revoke all on function public.fn_eventos_operacionais_professor_v1(
  integer, timestamptz, timestamptz, text, integer, text[]
) from public, anon, authenticated, service_role;
grant execute on function public.fn_eventos_operacionais_professor_v1(
  integer, timestamptz, timestamptz, text, integer, text[]
) to service_role;

revoke all on function public.fn_aniversariantes_do_professor_v1(integer, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_aniversariantes_do_professor_v1(integer, date, date)
  to service_role;

revoke all on function public.fn_eventos_operacionais_carga_inicial_v1(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_eventos_operacionais_carga_inicial_v1(timestamptz)
  to service_role;
