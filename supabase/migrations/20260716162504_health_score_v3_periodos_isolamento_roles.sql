-- Corrige privilegios herdados do projeto para garantir revisao append-only.

revoke all on public.professor_periodos_revisoes_v1 from service_role;
grant select, insert on public.professor_periodos_revisoes_v1 to service_role;

revoke all on public.vw_professor_periodos_diagnostico_v1 from service_role;
grant select on public.vw_professor_periodos_diagnostico_v1 to service_role;

do $$
declare
  v_role text;
begin
  foreach v_role in array array[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on public.professor_periodos_revisoes_v1 from %I', v_role);
      execute format('revoke all on public.vw_professor_periodos_diagnostico_v1 from %I', v_role);
    end if;
  end loop;
end;
$$;
