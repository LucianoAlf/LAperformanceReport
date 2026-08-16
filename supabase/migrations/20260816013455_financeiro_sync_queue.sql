-- Checkpoint 3: fila unica e duravel para o sync financeiro Emusys.
-- Nenhum cron novo e ligado nesta migration. Os tres disparos diretos antigos
-- sao removidos para que publicacoes futuras passem exclusivamente pela fila.

create table public.financeiro_sync_queue (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  status text not null default 'pending',
  priority integer not null default 100,
  trigger_source text not null,
  requested_by text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 12,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id uuid,
  sync_run_id uuid references public.sync_runs(id),
  last_http_status integer,
  last_error_code text,
  last_error_detail text,
  last_retry_after_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financeiro_sync_queue_status_chk check (
    status in ('pending', 'running', 'retry_wait', 'succeeded', 'failed')
  ),
  constraint financeiro_sync_queue_competencia_chk check (
    competencia = date_trunc('month', competencia)::date
  ),
  constraint financeiro_sync_queue_priority_chk check (priority between 0 and 10000),
  constraint financeiro_sync_queue_attempts_chk check (
    attempt_count >= 0 and max_attempts between 1 and 50
  ),
  constraint financeiro_sync_queue_retry_after_chk check (
    last_retry_after_seconds is null or last_retry_after_seconds >= 0
  ),
  constraint financeiro_sync_queue_running_chk check (
    status <> 'running'
    or (worker_id is not null and lease_expires_at is not null)
  ),
  constraint financeiro_sync_queue_terminal_chk check (
    status not in ('succeeded', 'failed') or completed_at is not null
  )
);

create unique index financeiro_sync_queue_competencia_active_uniq
  on public.financeiro_sync_queue (competencia)
  where status in ('pending', 'running', 'retry_wait');

create unique index financeiro_sync_queue_one_running_uniq
  on public.financeiro_sync_queue ((true))
  where status = 'running';

create index financeiro_sync_queue_due_idx
  on public.financeiro_sync_queue (priority, next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

create index financeiro_sync_queue_competencia_history_idx
  on public.financeiro_sync_queue (competencia, created_at desc);

alter table public.financeiro_sync_queue enable row level security;

revoke all on table public.financeiro_sync_queue
  from public, anon, authenticated;

create or replace function public.enqueue_financeiro_sync_competencias(
  p_competencias date[],
  p_trigger_source text,
  p_requested_by text default null,
  p_priority integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_requested_count integer;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_competencias is null
     or cardinality(p_competencias) < 1
     or cardinality(p_competencias) > 24 then
    raise exception 'FINANCEIRO_QUEUE_COMPETENCIAS_INVALIDAS: informe 1..24 competencias';
  end if;
  if nullif(btrim(p_trigger_source), '') is null then
    raise exception 'FINANCEIRO_QUEUE_TRIGGER_INVALIDO';
  end if;
  if p_priority < 0 or p_priority > 10000 then
    raise exception 'FINANCEIRO_QUEUE_PRIORITY_INVALIDA';
  end if;
  if exists (
    select 1
    from unnest(p_competencias) as requested(competencia)
    where requested.competencia is null
       or requested.competencia <> date_trunc('month', requested.competencia)::date
  ) then
    raise exception 'FINANCEIRO_QUEUE_COMPETENCIA_INVALIDA: use o primeiro dia do mes';
  end if;

  select count(distinct requested.competencia)::integer
  into v_requested_count
  from unnest(p_competencias) as requested(competencia);

  for v_competencia in
    select distinct requested.competencia
    from unnest(p_competencias) as requested(competencia)
    order by requested.competencia
  loop
    insert into public.financeiro_sync_queue as queue (
      competencia,
      status,
      priority,
      trigger_source,
      requested_by,
      next_attempt_at
    ) values (
      v_competencia,
      'pending',
      p_priority,
      btrim(p_trigger_source),
      nullif(btrim(p_requested_by), ''),
      now()
    )
    on conflict (competencia)
      where status in ('pending', 'running', 'retry_wait')
    do update set
      priority = least(queue.priority, excluded.priority),
      requested_by = coalesce(excluded.requested_by, queue.requested_by),
      updated_at = now();
  end loop;

  select jsonb_build_object(
    'requested_count', v_requested_count,
    'active_count', count(*)::integer,
    'jobs', coalesce(jsonb_agg(jsonb_build_object(
      'id', queue.id,
      'competencia', queue.competencia,
      'status', queue.status,
      'priority', queue.priority,
      'attempt_count', queue.attempt_count,
      'max_attempts', queue.max_attempts,
      'next_attempt_at', queue.next_attempt_at
    ) order by queue.priority, queue.competencia), '[]'::jsonb)
  )
  into v_result
  from public.financeiro_sync_queue queue
  where queue.competencia = any(p_competencias)
    and queue.status in ('pending', 'running', 'retry_wait');

  return v_result;
end;
$function$;

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
      and sr.snapshot_complete = true
      and sr.unidades_concluidas = 3
    order by sr.competencia, sr.completed_at desc nulls last, sr.id desc
  ),
  candidatas as (
    select date_trunc(
      'month',
      (now() at time zone 'America/Sao_Paulo')
    )::date as competencia
    union
    select (
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
      - interval '1 month'
    )::date
    union
    select (
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
      + interval '1 month'
    )::date
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
    100
  );
end;
$function$;

create or replace function public.claim_financeiro_sync_job(
  p_worker_id uuid,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.financeiro_sync_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_worker_id is null then
    raise exception 'FINANCEIRO_QUEUE_WORKER_INVALIDO';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'FINANCEIRO_QUEUE_LEASE_INVALIDO: use 60..3600 segundos';
  end if;

  update public.financeiro_sync_queue queue
  set
    status = case
      when queue.attempt_count >= queue.max_attempts then 'failed'
      else 'retry_wait'
    end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case
      when queue.attempt_count >= queue.max_attempts then now()
      else null
    end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  select queue.*
  into v_job
  from public.financeiro_sync_queue queue
  where queue.status in ('pending', 'retry_wait')
    and queue.next_attempt_at <= now()
    and queue.attempt_count < queue.max_attempts
    and not exists (
      select 1
      from public.financeiro_sync_queue running
      where running.status = 'running'
    )
  order by queue.priority, queue.competencia, queue.next_attempt_at, queue.created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.financeiro_sync_queue queue
  set
    status = 'running',
    worker_id = p_worker_id,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempt_count = queue.attempt_count + 1,
    started_at = coalesce(queue.started_at, now()),
    completed_at = null,
    updated_at = now()
  where queue.id = v_job.id
  returning to_jsonb(queue.*) into v_result;

  return v_result;
exception
  when unique_violation then
    return null;
end;
$function$;

create or replace function public.retry_financeiro_sync_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_sync_run_id uuid,
  p_error_code text,
  p_error_detail text,
  p_http_status integer default null,
  p_retry_after_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.financeiro_sync_queue%rowtype;
  v_delay_seconds integer;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_retry_after_seconds is not null
     and (p_retry_after_seconds < 0 or p_retry_after_seconds > 86400) then
    raise exception 'FINANCEIRO_QUEUE_RETRY_AFTER_INVALIDO';
  end if;

  select queue.*
  into v_job
  from public.financeiro_sync_queue queue
  where queue.id = p_job_id
  for update;

  if not found then
    raise exception 'FINANCEIRO_QUEUE_JOB_INEXISTENTE: %', p_job_id;
  end if;
  if v_job.status <> 'running' or v_job.worker_id is distinct from p_worker_id then
    raise exception 'FINANCEIRO_QUEUE_LEASE_INVALIDO: job nao pertence ao worker';
  end if;

  v_delay_seconds := greatest(
    coalesce(p_retry_after_seconds, 0),
    least(
      3600,
      (30 * power(2, greatest(v_job.attempt_count - 1, 0)))::integer
    )
  );

  if v_job.attempt_count >= v_job.max_attempts then
    update public.financeiro_sync_queue queue
    set
      status = 'failed',
      worker_id = null,
      lease_expires_at = null,
      sync_run_id = coalesce(p_sync_run_id, queue.sync_run_id),
      last_http_status = p_http_status,
      last_error_code = coalesce(nullif(btrim(p_error_code), ''), 'RETRY_EXHAUSTED'),
      last_error_detail = left(coalesce(p_error_detail, 'retry esgotado'), 8000),
      last_retry_after_seconds = p_retry_after_seconds,
      completed_at = now(),
      updated_at = now()
    where queue.id = v_job.id
    returning jsonb_build_object(
      'id', queue.id,
      'competencia', queue.competencia,
      'status', queue.status,
      'attempt_count', queue.attempt_count,
      'max_attempts', queue.max_attempts,
      'sync_run_id', queue.sync_run_id
    ) into v_result;
  else
    update public.financeiro_sync_queue queue
    set
      status = 'retry_wait',
      next_attempt_at = now() + make_interval(secs => v_delay_seconds),
      worker_id = null,
      lease_expires_at = null,
      sync_run_id = coalesce(p_sync_run_id, queue.sync_run_id),
      last_http_status = p_http_status,
      last_error_code = coalesce(nullif(btrim(p_error_code), ''), 'RETRYABLE_ERROR'),
      last_error_detail = left(coalesce(p_error_detail, 'falha transitoria'), 8000),
      last_retry_after_seconds = p_retry_after_seconds,
      completed_at = null,
      updated_at = now()
    where queue.id = v_job.id
    returning jsonb_build_object(
      'id', queue.id,
      'competencia', queue.competencia,
      'status', queue.status,
      'attempt_count', queue.attempt_count,
      'max_attempts', queue.max_attempts,
      'next_attempt_at', queue.next_attempt_at,
      'delay_seconds', v_delay_seconds,
      'sync_run_id', queue.sync_run_id
    ) into v_result;
  end if;

  return v_result;
end;
$function$;

create or replace function public.complete_financeiro_sync_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_sync_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.financeiro_sync_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  select queue.*
  into v_job
  from public.financeiro_sync_queue queue
  where queue.id = p_job_id
  for update;

  if not found then
    raise exception 'FINANCEIRO_QUEUE_JOB_INEXISTENTE: %', p_job_id;
  end if;
  if v_job.status <> 'running' or v_job.worker_id is distinct from p_worker_id then
    raise exception 'FINANCEIRO_QUEUE_LEASE_INVALIDO: job nao pertence ao worker';
  end if;
  if not exists (
    select 1
    from public.sync_runs run
    where run.id = p_sync_run_id
      and run.competencia = v_job.competencia
      and run.run_type = 'live'
      and run.status = 'succeeded'
      and run.snapshot_complete = true
      and run.unidades_concluidas = 3
  ) then
    raise exception 'FINANCEIRO_QUEUE_RUN_INCOMPLETO: sucesso exige snapshot completo';
  end if;

  update public.financeiro_sync_queue queue
  set
    status = 'succeeded',
    worker_id = null,
    lease_expires_at = null,
    sync_run_id = p_sync_run_id,
    completed_at = now(),
    updated_at = now()
  where queue.id = v_job.id
  returning jsonb_build_object(
    'id', queue.id,
    'competencia', queue.competencia,
    'status', queue.status,
    'attempt_count', queue.attempt_count,
    'sync_run_id', queue.sync_run_id,
    'completed_at', queue.completed_at
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.fail_financeiro_sync_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_sync_run_id uuid,
  p_error_code text,
  p_error_detail text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.financeiro_sync_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  select queue.*
  into v_job
  from public.financeiro_sync_queue queue
  where queue.id = p_job_id
  for update;

  if not found then
    raise exception 'FINANCEIRO_QUEUE_JOB_INEXISTENTE: %', p_job_id;
  end if;
  if v_job.status <> 'running' or v_job.worker_id is distinct from p_worker_id then
    raise exception 'FINANCEIRO_QUEUE_LEASE_INVALIDO: job nao pertence ao worker';
  end if;

  update public.financeiro_sync_queue queue
  set
    status = 'failed',
    worker_id = null,
    lease_expires_at = null,
    sync_run_id = coalesce(p_sync_run_id, queue.sync_run_id),
    last_error_code = coalesce(nullif(btrim(p_error_code), ''), 'TERMINAL_ERROR'),
    last_error_detail = left(coalesce(p_error_detail, 'falha terminal'), 8000),
    completed_at = now(),
    updated_at = now()
  where queue.id = v_job.id
  returning jsonb_build_object(
    'id', queue.id,
    'competencia', queue.competencia,
    'status', queue.status,
    'attempt_count', queue.attempt_count,
    'sync_run_id', queue.sync_run_id,
    'last_error_code', queue.last_error_code,
    'completed_at', queue.completed_at
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.enqueue_financeiro_sync_competencias(date[], text, text, integer)
  from public, anon, authenticated;
revoke all on function public.enqueue_financeiro_sync_backlog(text, text)
  from public, anon, authenticated;
revoke all on function public.claim_financeiro_sync_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.retry_financeiro_sync_job(uuid, uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_financeiro_sync_job(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_financeiro_sync_job(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_financeiro_sync_competencias(date[], text, text, integer)
  to service_role;
grant execute on function public.enqueue_financeiro_sync_backlog(text, text)
  to service_role;
grant execute on function public.claim_financeiro_sync_job(uuid, integer)
  to service_role;
grant execute on function public.retry_financeiro_sync_job(uuid, uuid, uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.complete_financeiro_sync_job(uuid, uuid, uuid)
  to service_role;
grant execute on function public.fail_financeiro_sync_job(uuid, uuid, uuid, text, text)
  to service_role;

comment on table public.financeiro_sync_queue is
  'Fila unica do sync financeiro Emusys. Um job publica uma competencia completa das tres unidades.';
comment on function public.claim_financeiro_sync_job(uuid, integer) is
  'Claim atomico e nao bloqueante com lease; nunca mantem lock durante chamadas HTTP.';
comment on function public.retry_financeiro_sync_job(uuid, uuid, uuid, text, text, integer, integer) is
  'Persiste backoff exponencial e Retry-After sem repetir rajadas dentro da mesma invocacao.';

do $do$
declare
  v_job_name text;
begin
  foreach v_job_name in array array[
    'sync-faturas-competencia-atual',
    'sync-faturas-competencia-anterior',
    'sync-faturas-competencia-seguinte'
  ]
  loop
    if exists (select 1 from cron.job where jobname = v_job_name) then
      perform cron.unschedule(v_job_name);
    end if;
  end loop;
end;
$do$;
