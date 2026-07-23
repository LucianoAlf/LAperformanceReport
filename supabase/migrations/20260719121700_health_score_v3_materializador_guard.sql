-- Autoriza somente o materializador interno V3 a completar snapshots provisorios.
-- O corpo de calculo fica privado; o nome publico vira um wrapper service_role.
alter function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) rename to materializar_health_score_professor_v3_periodo_impl;

revoke all on function public.materializar_health_score_professor_v3_periodo_impl(
  date,
  text,
  uuid,
  integer
) from public, anon, authenticated, service_role;

create or replace function public.materializar_health_score_professor_v3_periodo(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  perform set_config('app.health_score_v3_mutacao_controlada', 'on', true);
  return public.materializar_health_score_professor_v3_periodo_impl(
    p_competencia,
    p_periodicidade,
    p_unidade_id,
    p_professor_id
  );
end;
$$;

revoke all on function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) from public, anon, authenticated;
grant execute on function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) to service_role;

comment on function public.materializar_health_score_professor_v3_periodo(
  date,
  text,
  uuid,
  integer
) is 'Wrapper interno V3: habilita mutacao controlada somente durante a materializacao; EXECUTE restrito ao service_role.';
