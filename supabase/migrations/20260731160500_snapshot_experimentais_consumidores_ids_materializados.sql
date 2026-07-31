begin;

-- Consumidores historicos liam os IDs tecnicos dentro do payload bruto. Trocar
-- essas referencias antes do saneamento preserva os KPIs sem manter JSON
-- extensivel e potencialmente sensivel.
do $migration$
declare
  v_consumidor record;
  v_definicao text;
  v_nova_definicao text;
  v_legados_restantes text;
begin
  for v_consumidor in
    select
      p.oid,
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_functiondef(p.oid) as function_definition
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (
        pg_get_functiondef(p.oid)
          like '%r.payload #>> ''{aluno,id_lead}''%'
        or pg_get_functiondef(p.oid)
          like '%r.payload #>> ''{aluno,id_aluno}''%'
      )
  loop
    v_definicao := v_consumidor.function_definition;
    v_nova_definicao := replace(
      v_definicao,
      'r.payload #>> ''{aluno,id_lead}''::text[]',
      'r.emusys_lead_id::text'
    );
    v_nova_definicao := replace(
      v_nova_definicao,
      'r.payload #>> ''{aluno,id_lead}''',
      'r.emusys_lead_id::text'
    );
    v_nova_definicao := replace(
      v_nova_definicao,
      'r.payload #>> ''{aluno,id_aluno}''::text[]',
      'r.emusys_aluno_id::text'
    );
    v_nova_definicao := replace(
      v_nova_definicao,
      'r.payload #>> ''{aluno,id_aluno}''',
      'r.emusys_aluno_id::text'
    );

    if v_nova_definicao = v_definicao then
      raise exception
        'consumidor %.% manteve referencia ao payload legado',
        v_consumidor.schema_name,
        v_consumidor.function_name;
    end if;

    execute v_nova_definicao;
  end loop;

  select string_agg(
    format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ),
    ', '
    order by n.nspname, p.proname, p.oid
  )
  into v_legados_restantes
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and (
      pg_get_functiondef(p.oid)
        like '%r.payload #>> ''{aluno,id_lead}''%'
      or pg_get_functiondef(p.oid)
        like '%r.payload #>> ''{aluno,id_aluno}''%'
    );

  if v_legados_restantes is not null then
    raise exception
      'consumidor ainda usa payload legado: %',
      v_legados_restantes;
  end if;
end;
$migration$;

comment on column public.emusys_experimentais_raw.emusys_lead_id is
  'Identificador tecnico do lead Emusys, materializado antes do saneamento do payload.';

comment on column public.emusys_experimentais_raw.emusys_aluno_id is
  'Identificador tecnico do aluno Emusys, materializado antes do saneamento do payload.';

commit;
