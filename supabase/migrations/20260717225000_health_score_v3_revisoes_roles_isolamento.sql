-- Corrige privilegios padrao herdados pelas views V3 criadas em 17/07/2026.

revoke all on table public.vw_professor_periodos_baseline_v3_sombra
  from public, anon, authenticated, service_role;
revoke all on table public.vw_professor_periodos_efetivos_v3_sombra
  from public, anon, authenticated, service_role;

do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format(
        'revoke all on table public.vw_professor_periodos_baseline_v3_sombra, public.vw_professor_periodos_efetivos_v3_sombra from %I',
        v_role
      );
    end if;
  end loop;
end;
$$;

grant select on table public.vw_professor_periodos_baseline_v3_sombra
  to service_role;
grant select on table public.vw_professor_periodos_efetivos_v3_sombra
  to service_role;
