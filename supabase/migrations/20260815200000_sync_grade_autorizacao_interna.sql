begin;

create or replace function public.validar_token_sync_grade_interno_v1(
  p_token text
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, vault, extensions, pg_temp
as $function$
declare
  v_token_esperado text;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  select s.decrypted_secret
    into v_token_esperado
  from vault.decrypted_secrets s
  where s.name = 'sync_grade_edge_token'
  limit 1;

  return v_token_esperado is not null
    and extensions.digest(p_token, 'sha256')
      = extensions.digest(v_token_esperado, 'sha256');
end;
$function$;

revoke all on function public.validar_token_sync_grade_interno_v1(text)
  from public, anon, authenticated;
grant execute on function public.validar_token_sync_grade_interno_v1(text)
  to service_role;

do $block$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'sync_grade_edge_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'sync_grade_edge_token',
      'Segredo interno dedicado aos crons de sync-grade-futura-emusys',
      null
    );
  end if;
end;
$block$;

do $block$
declare
  v_job record;
  v_quantidade integer;
  v_body jsonb;
begin
  select count(*)
    into v_quantidade
  from cron.job j
  where j.jobname in (
    'sync-grade-futura-barra',
    'sync-grade-futura-cg',
    'sync-grade-futura-recreio',
    'sync-grade-futura-cg-sabado',
    'sync-grade-futura-recreio-sabado',
    'sync-grade-futura-barra-sabado'
  );

  if v_quantidade <> 6 then
    raise exception
      'Cron da grade incompleto: esperados 6 jobs, encontrados %',
      v_quantidade;
  end if;

  for v_job in
    select j.jobid, j.jobname
    from cron.job j
    where j.jobname in (
      'sync-grade-futura-barra',
      'sync-grade-futura-cg',
      'sync-grade-futura-recreio',
      'sync-grade-futura-cg-sabado',
      'sync-grade-futura-recreio-sabado',
      'sync-grade-futura-barra-sabado'
    )
  loop
    v_body := case
      when v_job.jobname in ('sync-grade-futura-cg', 'sync-grade-futura-cg-sabado')
        then jsonb_build_object('janela_dias', 35, 'unidade_index', 0)
      when v_job.jobname in ('sync-grade-futura-barra', 'sync-grade-futura-barra-sabado')
        then jsonb_build_object('janela_dias', 35, 'unidade_index', 1)
      when v_job.jobname in ('sync-grade-futura-recreio', 'sync-grade-futura-recreio-sabado')
        then jsonb_build_object('janela_dias', 35, 'unidade_index', 2)
    end;

    perform cron.alter_job(
      v_job.jobid,
      command := format($command$
        select net.http_post(
          url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'supabase_anon_key'
              limit 1
            ),
            'x-sync-token', (
              select decrypted_secret
              from vault.decrypted_secrets
              where name = 'sync_grade_edge_token'
              limit 1
            ),
            'Content-Type', 'application/json'
          ),
          body := %L::jsonb,
          timeout_milliseconds := 180000
        );
      $command$, v_body::text)
    );
  end loop;
end;
$block$;

commit;
