-- Sincroniza diariamente o catalogo formal de disciplinas e professores do Emusys.
-- O token vive no Vault e nunca e persistido no historico de migrations.

create or replace function public.pode_sincronizar_professor_disciplinas_emusys_v1(
  p_unidade_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.fn_usuario_atual_tem_permissao(
    'professores.editar'::varchar,
    p_unidade_id
  );
$function$;

comment on function public.pode_sincronizar_professor_disciplinas_emusys_v1(uuid)
  is 'Autoriza o sync manual do catalogo Emusys no escopo da unidade.';

revoke all on function public.pode_sincronizar_professor_disciplinas_emusys_v1(uuid)
  from public, anon;
grant execute on function public.pode_sincronizar_professor_disciplinas_emusys_v1(uuid)
  to authenticated, service_role;

do $migration$
declare
  v_job record;
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'sync_professor_disciplinas_token'
      and nullif(btrim(decrypted_secret), '') is not null
  ) then
    raise exception 'Vault secret sync_professor_disciplinas_token ausente';
  end if;

  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'sync-professor-disciplinas-emusys-barra',
      'sync-professor-disciplinas-emusys-recreio',
      'sync-professor-disciplinas-emusys-campo-grande'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$migration$;

select cron.schedule(
  'sync-professor-disciplinas-emusys-barra',
  '15 9 * * *',
  $job$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-professor-disciplinas-emusys',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'sync_professor_disciplinas_token'
        )
      ),
      body := '{"unidade_id":"368d47f5-2d88-4475-bc14-ba084a9a348e","origem":"cron","modo":"diagnostico"}'::jsonb,
      timeout_milliseconds := 300000
    );
  $job$
);

select cron.schedule(
  'sync-professor-disciplinas-emusys-recreio',
  '35 9 * * *',
  $job$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-professor-disciplinas-emusys',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'sync_professor_disciplinas_token'
        )
      ),
      body := '{"unidade_id":"95553e96-971b-4590-a6eb-0201d013c14d","origem":"cron","modo":"diagnostico"}'::jsonb,
      timeout_milliseconds := 300000
    );
  $job$
);

select cron.schedule(
  'sync-professor-disciplinas-emusys-campo-grande',
  '55 9 * * *',
  $job$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-professor-disciplinas-emusys',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'sync_professor_disciplinas_token'
        )
      ),
      body := '{"unidade_id":"2ec861f6-023f-4d7b-9927-3960ad8c2a92","origem":"cron","modo":"diagnostico"}'::jsonb,
      timeout_milliseconds := 300000
    );
  $job$
);
