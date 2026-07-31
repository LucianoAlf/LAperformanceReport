begin;

create or replace function public.validar_token_sync_presenca_interno_v1(
  p_token text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_token_esperado text;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  select s.decrypted_secret
    into v_token_esperado
  from vault.decrypted_secrets s
  where s.name = 'sync_presenca_edge_token'
  limit 1;

  return v_token_esperado is not null
    and extensions.digest(p_token, 'sha256')
      = extensions.digest(v_token_esperado, 'sha256');
end;
$$;

revoke all on function public.validar_token_sync_presenca_interno_v1(text)
  from public, anon, authenticated;
grant execute on function public.validar_token_sync_presenca_interno_v1(text)
  to service_role;

do $$
declare
  v_secret_id uuid;
begin
  select s.id
    into v_secret_id
  from vault.decrypted_secrets s
  where s.name = 'sync_presenca_edge_token'
  limit 1;

  if v_secret_id is null then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sync_presenca_edge_token',
      'Segredo interno dedicado aos crons de sync-presenca-emusys',
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sync_presenca_edge_token',
      'Segredo interno dedicado aos crons de sync-presenca-emusys',
      null
    );
  end if;
end;
$$;

do $$
declare
  v_job record;
  v_body jsonb;
  v_indice integer;
  v_dias integer;
  v_command text;
begin
  for v_job in
    select j.jobid, j.jobname
    from cron.job j
    where j.command ilike '%/functions/v1/sync-presenca-emusys%'
    order by j.jobid
  loop
    if v_job.jobname ~ '^sync-agenda-professor-emusys-u[0-2]$' then
      v_indice := right(v_job.jobname, 1)::integer;
      v_body := jsonb_build_object(
        'modo', 'agenda',
        'dias_futuros', 7,
        'unidade_index', v_indice
      );
    elsif v_job.jobname ~ '^sync-metadados-aulas-15m-u[0-2]$' then
      v_indice := right(v_job.jobname, 1)::integer;
      v_body := jsonb_build_object(
        'modo', 'metadados',
        'dias', 2,
        'dias_futuros', 35,
        'unidade_index', v_indice
      );
    elsif v_job.jobname in (
      'sync-presenca-cg',
      'sync-presenca-cg-sabado',
      'sync-presenca-barra',
      'sync-presenca-barra-sabado',
      'sync-presenca-recreio',
      'sync-presenca-recreio-sabado'
    ) then
      v_indice := case
        when v_job.jobname like 'sync-presenca-cg%' then 0
        when v_job.jobname like 'sync-presenca-barra%' then 1
        else 2
      end;
      v_dias := case when v_indice = 0 then 5 else 7 end;
      v_body := jsonb_build_object(
        'modo', 'presenca',
        'dias', v_dias,
        'unidade_index', v_indice
      );
    else
      raise exception 'SYNC_PRESENCA_CRON_NAO_MIGRADO: %', v_job.jobname;
    end if;

    v_command := format($command$
      select net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
        headers := jsonb_build_object(
          'x-sync-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'sync_presenca_edge_token'
            limit 1
          ),
          'Content-Type', 'application/json'
        ),
        body := %L::jsonb,
        timeout_milliseconds := 180000
      );
    $command$, v_body::text);

    perform cron.alter_job(v_job.jobid, command := v_command);
  end loop;

  if exists (
    select 1
    from cron.job j
    where j.command ilike '%/functions/v1/sync-presenca-emusys%'
      and j.command not ilike '%x-sync-token%'
  ) then
    raise exception 'SYNC_PRESENCA_CRON_AUTH_INCOMPLETA';
  end if;
end;
$$;

commit;
