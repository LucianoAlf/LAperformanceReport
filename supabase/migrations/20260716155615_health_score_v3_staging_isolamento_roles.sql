-- Fecha default privileges amplas do projeto sobre o staging V3.
-- Somente o dono da migration, a plataforma e service_role permanecem autorizados.

do $$
declare
  v_table text;
  v_sequence text;
  v_role text;
begin
  foreach v_table in array array[
    'emusys_historico_backfill_execucoes_v1',
    'emusys_aulas_historico_staging_v1',
    'emusys_aulas_historico_revisoes_v1',
    'emusys_aula_alunos_historico_staging_v1'
  ]
  loop
    for v_role in
      select rolname
        from pg_roles
       where rolname not in ('postgres', 'service_role', 'supabase_admin')
         and rolname not like 'pg_%'
    loop
      execute format(
        'revoke all privileges on table public.%I from %I',
        v_table,
        v_role
      );
    end loop;
  end loop;

  foreach v_sequence in array array[
    'emusys_aulas_historico_staging_v1_id_seq',
    'emusys_aulas_historico_revisoes_v1_id_seq',
    'emusys_aula_alunos_historico_staging_v1_id_seq'
  ]
  loop
    for v_role in
      select rolname
        from pg_roles
       where rolname not in ('postgres', 'service_role', 'supabase_admin')
         and rolname not like 'pg_%'
    loop
      execute format(
        'revoke all privileges on sequence public.%I from %I',
        v_sequence,
        v_role
      );
    end loop;
  end loop;

  for v_role in
    select rolname
      from pg_roles
     where rolname not in ('postgres', 'service_role', 'supabase_admin')
       and rolname not like 'pg_%'
  loop
    execute format(
      'revoke all privileges on function public.registrar_pagina_backfill_historico_professor_v1(uuid,date,date,text,jsonb,text,boolean,date,date,integer) from %I',
      v_role
    );
  end loop;
end;
$$;

grant select, insert, update, delete
  on public.emusys_historico_backfill_execucoes_v1 to service_role;
grant select, insert, update, delete
  on public.emusys_aulas_historico_staging_v1 to service_role;
grant select, insert, update, delete
  on public.emusys_aulas_historico_revisoes_v1 to service_role;
grant select, insert, update, delete
  on public.emusys_aula_alunos_historico_staging_v1 to service_role;

grant usage, select on sequence public.emusys_aulas_historico_staging_v1_id_seq
  to service_role;
grant usage, select on sequence public.emusys_aulas_historico_revisoes_v1_id_seq
  to service_role;
grant usage, select on sequence public.emusys_aula_alunos_historico_staging_v1_id_seq
  to service_role;

grant execute on function public.registrar_pagina_backfill_historico_professor_v1(
  uuid, date, date, text, jsonb, text, boolean, date, date, integer
) to service_role;
