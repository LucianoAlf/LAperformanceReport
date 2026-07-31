begin;

-- Esta migration e deliberadamente autocontida. Ela tambem corrige bancos que
-- tenham registrado as versoes anteriores de 160500/161000.
alter table public.emusys_experimentais_raw
  add column if not exists emusys_lead_id_zero
    boolean not null default false;

create or replace function public.normalizar_payload_emusys_experimental_minimo()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_lead_texto text;
  v_aluno_texto text;
  v_cancelada boolean;
begin
  v_lead_texto := coalesce(
    nullif(btrim(new.payload #>> '{participante,id_lead}'), ''),
    nullif(btrim(new.payload #>> '{aluno,id_lead}'), ''),
    nullif(btrim(new.payload ->> 'id_lead'), ''),
    nullif(btrim(new.payload #>> '{aula,alunos,0,id_lead}'), ''),
    nullif(btrim(new.payload #>> '{alunos,0,id_lead}'), ''),
    new.emusys_lead_id::text
  );
  v_aluno_texto := coalesce(
    nullif(btrim(new.payload #>> '{participante,id_aluno}'), ''),
    nullif(btrim(new.payload #>> '{aluno,id_aluno}'), ''),
    nullif(btrim(new.payload ->> 'id_aluno'), ''),
    nullif(btrim(new.payload #>> '{aula,alunos,0,id_aluno}'), ''),
    nullif(btrim(new.payload #>> '{alunos,0,id_aluno}'), ''),
    new.emusys_aluno_id::text
  );

  if new.emusys_lead_id is null
     and v_lead_texto ~ '^[1-9][0-9]*$'
     and length(v_lead_texto) <= 10
     and v_lead_texto::numeric <= 2147483647 then
    new.emusys_lead_id := v_lead_texto::integer;
  end if;

  if new.emusys_aluno_id is null
     and v_aluno_texto ~ '^[1-9][0-9]*$'
     and length(v_aluno_texto) <= 10
     and v_aluno_texto::numeric <= 2147483647 then
    new.emusys_aluno_id := v_aluno_texto::integer;
  end if;

  -- Versoes antigas do scrub gravaram id_lead JSON null. Quando ha id_aluno
  -- positivo e nenhum lead positivo, recuperamos o marcador sem criar identidade.
  new.emusys_lead_id_zero :=
    coalesce(v_lead_texto ~ '^0+$', false)
    or (
      v_lead_texto is null
      and new.emusys_lead_id is null
      and new.emusys_aluno_id is not null
    );

  v_cancelada :=
    new.situacao_operacional = 'cancelada'
    or lower(coalesce(new.payload ->> 'cancelada', 'false')) = 'true';

  new.payload := jsonb_build_object(
    'schema_version', 1,
    'data_aula', new.data_aula,
    'horario_aula', new.horario_aula,
    'cancelada', v_cancelada,
    'aula', jsonb_build_object(
      'id', new.emusys_aula_id
    ),
    'participante', jsonb_build_object(
      'id_lead', case
        when new.emusys_lead_id_zero then 0
        else new.emusys_lead_id
      end,
      'id_aluno', new.emusys_aluno_id
    )
  );

  return new;
end;
$function$;

revoke all on function public.normalizar_payload_emusys_experimental_minimo()
  from public, anon, authenticated;

drop trigger if exists trg_normalizar_payload_emusys_experimental_minimo
  on public.emusys_experimentais_raw;

create trigger trg_normalizar_payload_emusys_experimental_minimo
before insert or update of
  payload,
  emusys_lead_id,
  emusys_aluno_id,
  data_aula,
  horario_aula,
  situacao_operacional,
  emusys_aula_id
on public.emusys_experimentais_raw
for each row
execute function public.normalizar_payload_emusys_experimental_minimo();

-- A atualizacao aciona o trigger e recupera o zero das linhas que ja foram
-- saneadas por 161000, alem de remover qualquer PII reintroduzida.
update public.emusys_experimentais_raw
set payload = coalesce(payload, '{}'::jsonb);

-- Corrige tanto consumidores ainda legados quanto os que uma versao anterior
-- de 160500 ja havia trocado diretamente por r.emusys_lead_id::text.
do $migration$
declare
  v_consumidor record;
  v_definicao text;
  v_nova_definicao text;
  v_incorretos_restantes text;
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
      and pg_get_functiondef(p.oid)
        ilike '%emusys_experimentais_raw%'
      and (
        pg_get_functiondef(p.oid)
          like '%r.payload #>> ''{aluno,id_lead}''%'
        or pg_get_functiondef(p.oid)
          like '%r.payload #>> ''{aluno,id_aluno}''%'
        or (
          pg_get_functiondef(p.oid) like '%r.emusys_lead_id::text%'
          and pg_get_functiondef(p.oid)
            not like '%r.emusys_lead_id_zero%'
        )
      )
  loop
    v_definicao := v_consumidor.function_definition;
    v_nova_definicao := replace(
      v_definicao,
      'r.payload #>> ''{aluno,id_lead}''::text[]',
      '(case when r.emusys_lead_id_zero then ''0'' else r.emusys_lead_id::text end)'
    );
    v_nova_definicao := replace(
      v_nova_definicao,
      'r.payload #>> ''{aluno,id_lead}''',
      '(case when r.emusys_lead_id_zero then ''0'' else r.emusys_lead_id::text end)'
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

    if v_nova_definicao not like '%r.emusys_lead_id_zero%'
       and v_nova_definicao like '%r.emusys_lead_id::text%' then
      v_nova_definicao := replace(
        v_nova_definicao,
        'r.emusys_lead_id::text',
        '(case when r.emusys_lead_id_zero then ''0'' else r.emusys_lead_id::text end)'
      );
    end if;

    if v_nova_definicao is distinct from v_definicao then
      execute v_nova_definicao;
    end if;
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
  into v_incorretos_restantes
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid)
      ilike '%emusys_experimentais_raw%'
    and (
      pg_get_functiondef(p.oid)
        like '%r.payload #>> ''{aluno,id_lead}''%'
      or pg_get_functiondef(p.oid)
        like '%r.payload #>> ''{aluno,id_aluno}''%'
      or (
        pg_get_functiondef(p.oid) like '%r.emusys_lead_id::text%'
        and pg_get_functiondef(p.oid)
          not like '%r.emusys_lead_id_zero%'
      )
    );

  if v_incorretos_restantes is not null then
    raise exception
      'consumidor permaneceu sem semantica materializada de id_lead zero: %',
      v_incorretos_restantes;
  end if;
end;
$migration$;

revoke select on table public.emusys_experimentais_raw
  from authenticated;

grant select (
  id,
  aluno_nome,
  data_aula,
  horario_aula,
  situacao_operacional,
  professor_id,
  unidade_id
) on table public.emusys_experimentais_raw
  to authenticated;

grant select on table public.emusys_experimentais_raw
  to service_role;

comment on column public.emusys_experimentais_raw.emusys_lead_id_zero is
  'Marcador tecnico recuperavel: id_lead=0 indica participante ja vinculado como aluno.';

commit;
