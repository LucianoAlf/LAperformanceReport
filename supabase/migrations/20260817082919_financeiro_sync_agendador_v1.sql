-- Produtores recorrentes da fila unica do sync financeiro.
-- O worker ja e serial e guarda o backoff de 429; estes jobs somente inserem
-- competencias com prioridades previsiveis. Nenhum deles chama o Emusys fora
-- de sync-faturas-emusys e nenhum dispara comunicacao de cobranca.

create or replace function public.enqueue_financeiro_sync_backlog(
  p_trigger_source text,
  p_requested_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencias date[];
  v_priority integer := case
    when p_trigger_source = 'cron_financeiro_backlog_2h' then 300
    else 100
  end;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  with ultimo_run_por_competencia as (
    select distinct on (sr.competencia)
      sr.id,
      sr.competencia
    from public.sync_runs sr
    where sr.run_type = 'live'
      and sr.status = 'succeeded'
      and sr.snapshot_complete is true
      and sr.unidades_concluidas = 3
    order by sr.competencia, sr.completed_at desc nulls last, sr.id desc
  ),
  candidatas as (
    select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as competencia
    union
    select (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date
    union
    select (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date
    union
    select ur.competencia
    from ultimo_run_por_competencia ur
    join public.sync_run_items i on i.run_id = ur.id
    where i.status = 'aberta'
       or i.source_missing is true
  )
  select array_agg(distinct candidatas.competencia order by candidatas.competencia)
  into v_competencias
  from candidatas;

  return public.enqueue_financeiro_sync_competencias(
    v_competencias,
    p_trigger_source,
    p_requested_by,
    v_priority
  );
end;
$function$;

comment on function public.enqueue_financeiro_sync_backlog(text, text) is
  'Inclui competencias com aberta ou source_missing na fila; o cron de backlog usa prioridade menor que refresh manual e rotina recente.';

do $do$
declare
  v_job_name text;
begin
  foreach v_job_name in array array[
    'financeiro-sync-atual-15m',
    'financeiro-sync-anteriores-60m',
    'financeiro-sync-backlog-2h'
  ]
  loop
    if exists (select 1 from cron.job where jobname = v_job_name) then
      perform cron.unschedule(v_job_name);
    end if;
  end loop;
end;
$do$;

select cron.schedule(
  'financeiro-sync-atual-15m',
  '3,18,33,48 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'supabase_anon_key'
        limit 1
      ),
      'x-sync-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'mode', 'enqueue_and_work',
      'competencias', jsonb_build_array(
        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-01')
      ),
      'include_backlog', false,
      'trigger_source', 'cron_financeiro_current_15m'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);

select cron.schedule(
  'financeiro-sync-anteriores-60m',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'supabase_anon_key'
        limit 1
      ),
      'x-sync-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'mode', 'enqueue_and_work',
      'competencias', jsonb_build_array(
        to_char(
          date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month',
          'YYYY-MM-01'
        ),
        to_char(
          date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '2 months',
          'YYYY-MM-01'
        )
      ),
      'include_backlog', false,
      'trigger_source', 'cron_financeiro_previous_60m'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);

select cron.schedule(
  'financeiro-sync-backlog-2h',
  '11 */2 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'supabase_anon_key'
        limit 1
      ),
      'x-sync-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'mode', 'enqueue_and_work',
      'include_backlog', true,
      'trigger_source', 'cron_financeiro_backlog_2h'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);
