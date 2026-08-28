-- O backlog anterior processava 14 dias das tres unidades em um unico worker.
-- Isso excede o limite real da Edge Function e deixa a ultima lease aberta ate
-- expirar. Cada execucao passa a tratar uma unica unidade e no maximo tres dias.
-- Cinco fatias rotativas cobrem, sem lacunas, os 14 dias anteriores.

begin;

create or replace function public.presenca_sync_backlog_janela_v1(
  p_data_base date
)
returns table(
  data_fim date,
  dias integer,
  deslocamento integer
)
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_faixa integer;
  v_inicio_ciclo date;
  v_deslocamento integer;
begin
  if p_data_base is null then
    raise exception using errcode = '22004', message = 'data_base_obrigatoria';
  end if;

  -- A ancora absoluta mantem cinco dias consecutivos no mesmo ciclo, inclusive
  -- na virada de ano bissexto. As fatias seguem da mais antiga para a recente.
  v_faixa := mod(p_data_base - date '2000-01-01', 5);
  v_inicio_ciclo := p_data_base - v_faixa;
  v_deslocamento := (4 - v_faixa) * 3;

  return query
  select
    v_inicio_ciclo - 1 - v_deslocamento,
    least(3, 14 - v_deslocamento),
    v_deslocamento;
end;
$function$;

revoke all on function public.presenca_sync_backlog_janela_v1(date)
from public, anon, authenticated, service_role;

do $block$
declare
  v_quantidade integer;
  v_job record;
begin
  select count(*)::integer
    into v_quantidade
    from cron.job
   where jobname = 'sync-presenca-backlog';

  if v_quantidade <> 1 then
    raise exception 'job monolitico sync-presenca-backlog ausente ou duplicado: %',
      v_quantidade;
  end if;

  perform cron.unschedule((
    select jobid
      from cron.job
     where jobname = 'sync-presenca-backlog'
  ));

  for v_job in
    select jobid
      from cron.job
     where jobname in (
       'sync-presenca-backlog-campo-grande',
       'sync-presenca-backlog-barra',
       'sync-presenca-backlog-recreio'
     )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$block$;

select cron.schedule(
  'sync-presenca-backlog-campo-grande',
  '12 6 * * *',
  $cron$
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
      body := jsonb_build_object(
        'modo', 'presenca',
        'dias', janela.dias,
        'data', janela.data_fim::text,
        'unidade_index', 0,
        'tipo_execucao', 'backlog_fatiado'
      ),
      timeout_milliseconds := 180000
    )
    from public.presenca_sync_backlog_janela_v1(
      (now() at time zone 'America/Sao_Paulo')::date
    ) janela;
  $cron$
);

select cron.schedule(
  'sync-presenca-backlog-barra',
  '32 6 * * *',
  $cron$
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
      body := jsonb_build_object(
        'modo', 'presenca',
        'dias', janela.dias,
        'data', janela.data_fim::text,
        'unidade_index', 1,
        'tipo_execucao', 'backlog_fatiado'
      ),
      timeout_milliseconds := 180000
    )
    from public.presenca_sync_backlog_janela_v1(
      (now() at time zone 'America/Sao_Paulo')::date
    ) janela;
  $cron$
);

select cron.schedule(
  'sync-presenca-backlog-recreio',
  '52 6 * * *',
  $cron$
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
      body := jsonb_build_object(
        'modo', 'presenca',
        'dias', janela.dias,
        'data', janela.data_fim::text,
        'unidade_index', 2,
        'tipo_execucao', 'backlog_fatiado'
      ),
      timeout_milliseconds := 180000
    )
    from public.presenca_sync_backlog_janela_v1(
      (now() at time zone 'America/Sao_Paulo')::date
    ) janela;
  $cron$
);

do $block$
declare
  v_quantidade integer;
begin
  select count(*)::integer
    into v_quantidade
    from cron.job
   where jobname in (
     'sync-presenca-backlog-campo-grande',
     'sync-presenca-backlog-barra',
     'sync-presenca-backlog-recreio'
   );

  if v_quantidade <> 3 then
    raise exception 'jobs de backlog fatiado incompletos: %', v_quantidade;
  end if;
end;
$block$;

comment on function public.presenca_sync_backlog_janela_v1(date) is
  '[interna] Seleciona uma de cinco fatias de ate tres dias que cobrem o backlog movel de 14 dias.';

commit;
