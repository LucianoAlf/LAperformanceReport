-- Frescor e fila duravel do espelho de lancamentos Emusys.
-- Nao altera colunas nem o contrato de exportacao de financeiro_emusys_*.

create table public.sync_financeiro_emusys_queue (
  id uuid primary key default gen_random_uuid(),
  unidade_codigo text not null,
  data_inicial date not null,
  data_final date not null,
  catalogos boolean not null default false,
  trigger_source text not null,
  priority integer not null default 100,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_retries integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id uuid,
  last_http_status integer,
  last_error_code text,
  last_error_detail text,
  last_retry_after_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_financeiro_emusys_queue_unidade_chk check (
    unidade_codigo in ('cg', 'barra', 'recreio')
  ),
  constraint sync_financeiro_emusys_queue_datas_chk check (data_inicial <= data_final),
  constraint sync_financeiro_emusys_queue_status_chk check (
    status in ('pending', 'running', 'retry_wait', 'succeeded', 'failed')
  ),
  constraint sync_financeiro_emusys_queue_priority_chk check (priority between 0 and 10000),
  constraint sync_financeiro_emusys_queue_attempts_chk check (
    attempt_count >= 0 and max_retries between 0 and 10 and attempt_count <= max_retries + 1
  ),
  constraint sync_financeiro_emusys_queue_retry_after_chk check (
    last_retry_after_seconds is null or last_retry_after_seconds >= 0
  ),
  constraint sync_financeiro_emusys_queue_running_chk check (
    (status = 'running' and worker_id is not null and lease_expires_at is not null)
    or (status <> 'running' and worker_id is null and lease_expires_at is null)
  ),
  constraint sync_financeiro_emusys_queue_terminal_chk check (
    (status in ('succeeded', 'failed') and completed_at is not null)
    or (status not in ('succeeded', 'failed') and completed_at is null)
  )
);

create unique index sync_financeiro_emusys_queue_active_range_uniq
  on public.sync_financeiro_emusys_queue (unidade_codigo, data_inicial, data_final)
  where status in ('pending', 'running', 'retry_wait');

create unique index sync_financeiro_emusys_queue_one_running_uniq
  on public.sync_financeiro_emusys_queue ((true))
  where status = 'running';

create index sync_financeiro_emusys_queue_due_idx
  on public.sync_financeiro_emusys_queue (priority, next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

alter table public.sync_financeiro_emusys_queue enable row level security;
revoke all on table public.sync_financeiro_emusys_queue from public, anon, authenticated;
grant select, insert, update on table public.sync_financeiro_emusys_queue to service_role;

comment on table public.sync_financeiro_emusys_queue is
  'Fila serial da varredura de lancamentos Emusys. Uma tentativa inicial e no maximo tres retries de 30 minutos.';

create table public.sync_faturas_pagas_mes_queue (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  unidade_codigo text,
  trigger_source text not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 4,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  worker_id uuid,
  last_http_status integer,
  last_error_code text,
  last_error_detail text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_faturas_pagas_mes_queue_competencia_chk check (
    competencia = date_trunc('month', competencia)::date
  ),
  constraint sync_faturas_pagas_mes_queue_unidade_chk check (
    unidade_codigo is null or unidade_codigo in ('cg', 'barra', 'recreio')
  ),
  constraint sync_faturas_pagas_mes_queue_status_chk check (
    status in ('pending', 'running', 'retry_wait', 'succeeded', 'failed')
  ),
  constraint sync_faturas_pagas_mes_queue_attempts_chk check (
    attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts
  ),
  constraint sync_faturas_pagas_mes_queue_running_chk check (
    (status = 'running' and worker_id is not null and lease_expires_at is not null)
    or (status <> 'running' and worker_id is null and lease_expires_at is null)
  ),
  constraint sync_faturas_pagas_mes_queue_terminal_chk check (
    (status in ('succeeded', 'failed') and completed_at is not null)
    or (status not in ('succeeded', 'failed') and completed_at is null)
  )
);

create unique index sync_faturas_pagas_mes_queue_active_uniq
  on public.sync_faturas_pagas_mes_queue (competencia, (coalesce(unidade_codigo, 'todas')))
  where status in ('pending', 'running', 'retry_wait');

create unique index sync_faturas_pagas_mes_queue_one_running_uniq
  on public.sync_faturas_pagas_mes_queue ((true))
  where status = 'running';

create index sync_faturas_pagas_mes_queue_due_idx
  on public.sync_faturas_pagas_mes_queue (next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

alter table public.sync_faturas_pagas_mes_queue enable row level security;
revoke all on table public.sync_faturas_pagas_mes_queue from public, anon, authenticated;
grant select, insert, update on table public.sync_faturas_pagas_mes_queue to service_role;

comment on table public.sync_faturas_pagas_mes_queue is
  'Fila duravel de faturas pagas por competencia de pagamento. Evita perder a rotina das 05:00 UTC quando lancamentos ainda estao ativos.';

create or replace function public.enqueue_sync_financeiro_emusys_job(
  p_unidade_codigo text,
  p_data_inicial date,
  p_data_final date,
  p_catalogos boolean,
  p_trigger_source text,
  p_priority integer default 100,
  p_max_retries integer default 3,
  p_next_attempt_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_hoje_brt date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_unidade_codigo not in ('cg', 'barra', 'recreio') then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_UNIDADE_INVALIDA: %', p_unidade_codigo;
  end if;
  if p_data_inicial is null or p_data_final is null or p_data_inicial > p_data_final then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_JANELA_INVALIDA';
  end if;
  if p_data_final >= v_hoje_brt then
    raise exception 'DIA_CORRENTE_NAO_ENCERRADO: data_final % deve ser anterior a %', p_data_final, v_hoje_brt;
  end if;
  if nullif(btrim(p_trigger_source), '') is null
     or p_priority is null
     or p_max_retries is null
     or p_priority not between 0 and 10000
     or p_max_retries not between 0 and 10 then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_PARAMETROS_INVALIDOS';
  end if;

  insert into public.sync_financeiro_emusys_queue as queue (
    unidade_codigo,
    data_inicial,
    data_final,
    catalogos,
    trigger_source,
    priority,
    max_retries,
    next_attempt_at
  ) values (
    p_unidade_codigo,
    p_data_inicial,
    p_data_final,
    coalesce(p_catalogos, false),
    nullif(btrim(p_trigger_source), ''),
    p_priority,
    p_max_retries,
    coalesce(p_next_attempt_at, now())
  )
  on conflict (unidade_codigo, data_inicial, data_final)
    where status in ('pending', 'running', 'retry_wait')
  do update set
    catalogos = queue.catalogos or excluded.catalogos,
    trigger_source = excluded.trigger_source,
    priority = least(queue.priority, excluded.priority),
    next_attempt_at = least(queue.next_attempt_at, excluded.next_attempt_at),
    updated_at = now()
  returning to_jsonb(queue.*) into v_result;

  return v_result;
end;
$function$;

create or replace function public.claim_sync_financeiro_emusys_job(
  p_worker_id uuid,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.sync_financeiro_emusys_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_worker_id is null or p_lease_seconds not between 60 and 600 then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_WORKER_INVALIDO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emusys-api-global-claim', 0));

  update public.sync_financeiro_emusys_queue queue
  set
    status = case when queue.attempt_count <= queue.max_retries then 'retry_wait' else 'failed' end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case when queue.attempt_count <= queue.max_retries then null else now() end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  update public.financeiro_sync_queue queue
  set
    status = case when queue.attempt_count >= queue.max_attempts then 'failed' else 'retry_wait' end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case when queue.attempt_count >= queue.max_attempts then now() else null end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  update public.sync_faturas_pagas_mes_queue queue
  set
    status = case when queue.attempt_count >= queue.max_attempts then 'failed' else 'retry_wait' end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case when queue.attempt_count >= queue.max_attempts then now() else null end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  if exists (
    select 1
    from public.financeiro_sync_queue faturas
    where faturas.status = 'running'
  ) or exists (
    select 1
    from public.sync_faturas_pagas_mes_queue pagas
    where pagas.status = 'running'
  ) then
    return null;
  end if;

  select queue.*
  into v_job
  from public.sync_financeiro_emusys_queue queue
  where queue.status in ('pending', 'retry_wait')
    and queue.next_attempt_at <= now()
    and queue.attempt_count <= queue.max_retries
    and not exists (
      select 1
      from public.sync_financeiro_emusys_queue running
      where running.status = 'running'
    )
  order by queue.priority, queue.next_attempt_at, queue.data_inicial, queue.created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.sync_financeiro_emusys_queue queue
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

create or replace function public.renew_sync_financeiro_emusys_job_lease(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_worker_id is null or p_lease_seconds not between 60 and 600 then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_WORKER_INVALIDO';
  end if;

  update public.sync_financeiro_emusys_queue queue
  set
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where queue.id = p_job_id
    and queue.status = 'running'
    and queue.worker_id = p_worker_id
    and queue.lease_expires_at > now()
  returning to_jsonb(queue.*) into v_result;

  if v_result is null then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_LEASE_PERDIDO';
  end if;
  return v_result;
end;
$function$;

create or replace function public.retry_sync_financeiro_emusys_job(
  p_job_id uuid,
  p_worker_id uuid,
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
  v_job public.sync_financeiro_emusys_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  select queue.* into v_job
  from public.sync_financeiro_emusys_queue queue
  where queue.id = p_job_id
    and queue.status = 'running'
    and queue.worker_id = p_worker_id
  for update;

  if not found then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_JOB_NAO_REIVINDICADO';
  end if;

  update public.sync_financeiro_emusys_queue queue
  set
    status = case when v_job.attempt_count <= v_job.max_retries then 'retry_wait' else 'failed' end,
    next_attempt_at = case
      when v_job.attempt_count <= v_job.max_retries then now() + interval '30 minutes'
      else queue.next_attempt_at
    end,
    worker_id = null,
    lease_expires_at = null,
    last_http_status = p_http_status,
    last_error_code = left(coalesce(p_error_code, 'SYNC_ERROR'), 100),
    last_error_detail = left(coalesce(p_error_detail, 'erro sem detalhe'), 1000),
    last_retry_after_seconds = p_retry_after_seconds,
    completed_at = case when v_job.attempt_count <= v_job.max_retries then null else now() end,
    updated_at = now()
  where queue.id = p_job_id
  returning to_jsonb(queue.*) into v_result;

  return v_result;
end;
$function$;

create or replace function public.complete_sync_financeiro_emusys_job(
  p_job_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  update public.sync_financeiro_emusys_queue queue
  set
    status = 'succeeded',
    worker_id = null,
    lease_expires_at = null,
    last_http_status = null,
    last_error_code = null,
    last_error_detail = null,
    last_retry_after_seconds = null,
    completed_at = now(),
    updated_at = now()
  where queue.id = p_job_id
    and queue.status = 'running'
    and queue.worker_id = p_worker_id
  returning to_jsonb(queue.*) into v_result;

  if v_result is null then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_JOB_NAO_REIVINDICADO';
  end if;
  return v_result;
end;
$function$;

create or replace function public.fail_sync_financeiro_emusys_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_error_detail text,
  p_http_status integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  update public.sync_financeiro_emusys_queue queue
  set
    status = 'failed',
    worker_id = null,
    lease_expires_at = null,
    last_http_status = p_http_status,
    last_error_code = left(coalesce(p_error_code, 'SYNC_ERROR'), 100),
    last_error_detail = left(coalesce(p_error_detail, 'erro sem detalhe'), 1000),
    completed_at = now(),
    updated_at = now()
  where queue.id = p_job_id
    and queue.status = 'running'
    and queue.worker_id = p_worker_id
  returning to_jsonb(queue.*) into v_result;

  if v_result is null then
    raise exception 'SYNC_FINANCEIRO_EMUSYS_JOB_NAO_REIVINDICADO';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.enqueue_sync_financeiro_emusys_job(text, date, date, boolean, text, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_sync_financeiro_emusys_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.renew_sync_financeiro_emusys_job_lease(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.retry_sync_financeiro_emusys_job(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_sync_financeiro_emusys_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_sync_financeiro_emusys_job(uuid, uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.enqueue_sync_financeiro_emusys_job(text, date, date, boolean, text, integer, integer, timestamptz)
  to service_role;
grant execute on function public.claim_sync_financeiro_emusys_job(uuid, integer)
  to service_role;
grant execute on function public.renew_sync_financeiro_emusys_job_lease(uuid, uuid, integer)
  to service_role;
grant execute on function public.retry_sync_financeiro_emusys_job(uuid, uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.complete_sync_financeiro_emusys_job(uuid, uuid)
  to service_role;
grant execute on function public.fail_sync_financeiro_emusys_job(uuid, uuid, text, text, integer)
  to service_role;

create or replace function public.enqueue_sync_faturas_pagas_mes_jobs(
  p_competencias date[],
  p_unidade_codigo text default null,
  p_trigger_source text default 'pagas_no_mes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date;
  v_job jsonb;
  v_jobs jsonb := '[]'::jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_competencias is null or cardinality(p_competencias) not between 1 and 3
     or (p_unidade_codigo is not null and p_unidade_codigo not in ('cg', 'barra', 'recreio'))
     or nullif(btrim(p_trigger_source), '') is null then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_PARAMETROS_INVALIDOS';
  end if;

  for v_competencia in select distinct unnest(p_competencias) order by 1
  loop
    if v_competencia is null or v_competencia <> date_trunc('month', v_competencia)::date then
      raise exception 'SYNC_FATURAS_PAGAS_COMPETENCIA_INVALIDA: %', v_competencia;
    end if;

    v_job := null;
    insert into public.sync_faturas_pagas_mes_queue as queue (
      competencia, unidade_codigo, trigger_source
    ) values (
      v_competencia, p_unidade_codigo, btrim(p_trigger_source)
    )
    on conflict do nothing
    returning to_jsonb(queue.*) into v_job;

    if v_job is null then
      select to_jsonb(queue.*) into v_job
      from public.sync_faturas_pagas_mes_queue queue
      where queue.competencia = v_competencia
        and coalesce(queue.unidade_codigo, '') = coalesce(p_unidade_codigo, '')
        and queue.status in ('pending', 'running', 'retry_wait')
      order by queue.created_at desc
      limit 1;
    end if;
    v_jobs := v_jobs || jsonb_build_array(v_job);
  end loop;

  return jsonb_build_object('jobs', v_jobs);
end;
$function$;

create or replace function public.claim_sync_faturas_pagas_mes_job(
  p_worker_id uuid,
  p_lease_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.sync_faturas_pagas_mes_queue%rowtype;
  v_result jsonb;
  v_agora_utc timestamp := clock_timestamp() at time zone 'UTC';
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_worker_id is null or p_lease_seconds not between 60 and 3600 then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_WORKER_INVALIDO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emusys-api-global-claim', 0));

  update public.sync_faturas_pagas_mes_queue queue
  set
    status = case when queue.attempt_count >= queue.max_attempts then 'failed' else 'retry_wait' end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case when queue.attempt_count >= queue.max_attempts then now() else null end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  if (v_agora_utc::time >= time '08:45' and v_agora_utc::time < time '11:00')
     or (extract(isodow from v_agora_utc) = 7 and extract(hour from v_agora_utc) = 4) then
    return null;
  end if;

  if exists (
    select 1 from public.sync_financeiro_emusys_queue lancamentos
    where lancamentos.status in ('pending', 'running', 'retry_wait')
  ) or exists (
    select 1 from public.financeiro_sync_queue faturas
    where faturas.status = 'running'
  ) then
    return null;
  end if;

  select queue.* into v_job
  from public.sync_faturas_pagas_mes_queue queue
  where queue.status in ('pending', 'retry_wait')
    and queue.next_attempt_at <= now()
    and queue.attempt_count < queue.max_attempts
    and not exists (
      select 1 from public.sync_faturas_pagas_mes_queue running where running.status = 'running'
    )
  order by queue.next_attempt_at, queue.competencia, queue.created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.sync_faturas_pagas_mes_queue queue
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

create or replace function public.retry_sync_faturas_pagas_mes_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_error_detail text,
  p_http_status integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.sync_faturas_pagas_mes_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  select queue.* into v_job
  from public.sync_faturas_pagas_mes_queue queue
  where queue.id = p_job_id and queue.status = 'running' and queue.worker_id = p_worker_id
  for update;
  if not found then
    raise exception 'SYNC_FATURAS_PAGAS_JOB_NAO_REIVINDICADO';
  end if;

  update public.sync_faturas_pagas_mes_queue queue
  set
    status = case when v_job.attempt_count < v_job.max_attempts then 'retry_wait' else 'failed' end,
    next_attempt_at = case when v_job.attempt_count < v_job.max_attempts then now() + interval '30 minutes' else queue.next_attempt_at end,
    worker_id = null,
    lease_expires_at = null,
    last_http_status = p_http_status,
    last_error_code = left(coalesce(p_error_code, 'SYNC_ERROR'), 100),
    last_error_detail = left(coalesce(p_error_detail, 'erro sem detalhe'), 1000),
    completed_at = case when v_job.attempt_count < v_job.max_attempts then null else now() end,
    updated_at = now()
  where queue.id = p_job_id
  returning to_jsonb(queue.*) into v_result;
  return v_result;
end;
$function$;

create or replace function public.complete_sync_faturas_pagas_mes_job(
  p_job_id uuid,
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  update public.sync_faturas_pagas_mes_queue queue
  set status = 'succeeded', worker_id = null, lease_expires_at = null,
      last_http_status = null, last_error_code = null, last_error_detail = null,
      completed_at = now(), updated_at = now()
  where queue.id = p_job_id and queue.status = 'running' and queue.worker_id = p_worker_id
  returning to_jsonb(queue.*) into v_result;
  if v_result is null then raise exception 'SYNC_FATURAS_PAGAS_JOB_NAO_REIVINDICADO'; end if;
  return v_result;
end;
$function$;

create or replace function public.fail_sync_faturas_pagas_mes_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_error_code text,
  p_error_detail text,
  p_http_status integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_FATURAS_PAGAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  update public.sync_faturas_pagas_mes_queue queue
  set status = 'failed', worker_id = null, lease_expires_at = null,
      last_http_status = p_http_status,
      last_error_code = left(coalesce(p_error_code, 'SYNC_ERROR'), 100),
      last_error_detail = left(coalesce(p_error_detail, 'erro sem detalhe'), 1000),
      completed_at = now(), updated_at = now()
  where queue.id = p_job_id and queue.status = 'running' and queue.worker_id = p_worker_id
  returning to_jsonb(queue.*) into v_result;
  if v_result is null then raise exception 'SYNC_FATURAS_PAGAS_JOB_NAO_REIVINDICADO'; end if;
  return v_result;
end;
$function$;

revoke all on function public.enqueue_sync_faturas_pagas_mes_jobs(date[], text, text) from public, anon, authenticated;
revoke all on function public.claim_sync_faturas_pagas_mes_job(uuid, integer) from public, anon, authenticated;
revoke all on function public.retry_sync_faturas_pagas_mes_job(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_sync_faturas_pagas_mes_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_sync_faturas_pagas_mes_job(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_sync_faturas_pagas_mes_jobs(date[], text, text) to service_role;
grant execute on function public.claim_sync_faturas_pagas_mes_job(uuid, integer) to service_role;
grant execute on function public.retry_sync_faturas_pagas_mes_job(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.complete_sync_faturas_pagas_mes_job(uuid, uuid) to service_role;
grant execute on function public.fail_sync_faturas_pagas_mes_job(uuid, uuid, text, text, integer) to service_role;

-- O mesmo mutex decide qual fila pode iniciar uma chamada ao Emusys. Lancamentos
-- ganham prioridade enquanto houver job ativo, inclusive no retry_wait de 30 min.
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
  v_agora_utc timestamp := clock_timestamp() at time zone 'UTC';
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

  perform pg_advisory_xact_lock(hashtextextended('emusys-api-global-claim', 0));

  update public.financeiro_sync_queue queue
  set
    status = case when queue.attempt_count >= queue.max_attempts then 'failed' else 'retry_wait' end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case when queue.attempt_count >= queue.max_attempts then now() else null end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  update public.sync_faturas_pagas_mes_queue queue
  set
    status = case when queue.attempt_count >= queue.max_attempts then 'failed' else 'retry_wait' end,
    next_attempt_at = now(),
    worker_id = null,
    lease_expires_at = null,
    last_error_code = 'WORKER_LEASE_EXPIRED',
    last_error_detail = 'lease do worker expirou antes da conclusao',
    completed_at = case when queue.attempt_count >= queue.max_attempts then now() else null end,
    updated_at = now()
  where queue.status = 'running'
    and queue.lease_expires_at <= now();

  if (v_agora_utc::time >= time '08:45' and v_agora_utc::time < time '11:00')
     or (extract(isodow from v_agora_utc) = 7 and extract(hour from v_agora_utc) = 4) then
    return null;
  end if;

  if exists (
    select 1
    from public.sync_financeiro_emusys_queue lancamentos
    where lancamentos.status in ('pending', 'running', 'retry_wait')
  ) or exists (
    select 1
    from public.sync_faturas_pagas_mes_queue pagas
    where pagas.status in ('pending', 'running', 'retry_wait')
  ) then
    return null;
  end if;

  select queue.*
  into v_job
  from public.financeiro_sync_queue queue
  where queue.status in ('pending', 'retry_wait')
    and queue.next_attempt_at <= now()
    and queue.attempt_count < queue.max_attempts
    and not exists (
      select 1 from public.financeiro_sync_queue running where running.status = 'running'
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

-- Corrige o estado gravado antes do encerramento do dia, sem apagar os itens.
update public.financeiro_emusys_varredura_dias
set
  status = 'erro',
  ultimo_erro = 'DIA_CORRENTE_NAO_ENCERRADO: aguardar a virada do dia em America/Sao_Paulo',
  concluido_em = null,
  ultima_tentativa_em = now()
where data >= (now() at time zone 'America/Sao_Paulo')::date
  and status = 'completo';

update public.financeiro_emusys_varredura_resumo
set
  janela_inicio = (now() at time zone 'America/Sao_Paulo')::date - 10,
  janela_fim = (now() at time zone 'America/Sao_Paulo')::date - 1,
  ultima_varredura_completa_em = null,
  dias_pendentes = 10,
  ultimo_erro = 'JANELA_10_DIAS_AGUARDANDO_REVARREDURA',
  atualizado_em = now();

-- Reagenda os produtores. pg_cron usa UTC.
do $do$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname like 'sync-financeiro-emusys-%'
       or jobname in (
         'sync-faturas-fila-worker',
         'financeiro-sync-atual-15m',
         'financeiro-sync-anteriores-60m',
         'financeiro-sync-backlog-2h',
         'sync-faturas-pagas-no-mes-diario',
         'financeiro-emusys-recovery-jul-set-20260920',
         'financeiro-emusys-recovery-close-20260920',
         'backfill-faturas-jan-mai-20260920'
       )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$do$;

select cron.schedule('sync-financeiro-emusys-cg-principal', '5 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_daily","unidade":"cg","trigger_source":"cron_financeiro_daily","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

select cron.schedule('sync-financeiro-emusys-recreio-principal', '15 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_daily","unidade":"recreio","trigger_source":"cron_financeiro_daily","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

select cron.schedule('sync-financeiro-emusys-barra-principal', '25 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_daily","unidade":"barra","trigger_source":"cron_financeiro_daily","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

select cron.schedule('sync-financeiro-emusys-fila-worker', '* * * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"worker","trigger_source":"cron_financeiro_emusys_worker"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

select cron.schedule('sync-financeiro-emusys-semanal', '0 4 * * 0', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_weekly","unidade":"todas","trigger_source":"cron_financeiro_weekly","catalogos":false}'::jsonb,
    timeout_milliseconds := 30000
  )
  where (now() at time zone 'UTC')::date <> date '2026-09-20';
$cron$);

-- Faturas: o worker fica disponivel as 05 UTC apenas para drenar a fila
-- duravel de pagas_no_mes; os demais produtores seguem pausados nessa hora.
-- Nenhum claim e permitido entre 08:45 e 10:59 UTC.
select cron.schedule('sync-faturas-fila-worker', '* 0-8,11-23 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"worker","trigger_source":"cron_financeiro_sync_worker"}'::jsonb,
    timeout_milliseconds := 240000
  )
  where not (
    extract(isodow from now() at time zone 'UTC') = 7
    and extract(hour from now() at time zone 'UTC') = 4
  );
$cron$);

select cron.schedule('financeiro-sync-atual-15m', '3,18,33,48 0-4,6-8,11-23 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := jsonb_build_object(
      'mode', 'enqueue_and_work',
      'competencias', jsonb_build_array(to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-01')),
      'include_backlog', false,
      'trigger_source', 'cron_financeiro_current_15m'
    ),
    timeout_milliseconds := 240000
  )
  where not (
    extract(isodow from now() at time zone 'UTC') = 7
    and extract(hour from now() at time zone 'UTC') = 4
  );
$cron$);

select cron.schedule('financeiro-sync-anteriores-60m', '7 0-4,6-8,11-23 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := jsonb_build_object(
      'mode', 'enqueue_and_work',
      'competencias', jsonb_build_array(
        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM-01'),
        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '2 months', 'YYYY-MM-01')
      ),
      'include_backlog', false,
      'trigger_source', 'cron_financeiro_previous_60m'
    ),
    timeout_milliseconds := 240000
  )
  where not (
    extract(isodow from now() at time zone 'UTC') = 7
    and extract(hour from now() at time zone 'UTC') = 4
  );
$cron$);

select cron.schedule('financeiro-sync-backlog-2h', '11 0,2,4,6,8,12,14,16,18,20,22 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := jsonb_build_object('mode', 'enqueue_and_work', 'include_backlog', true, 'trigger_source', 'cron_financeiro_backlog_2h'),
    timeout_milliseconds := 240000
  )
  where not (
    extract(isodow from now() at time zone 'UTC') = 7
    and extract(hour from now() at time zone 'UTC') = 4
  );
$cron$);

select cron.schedule('sync-faturas-pagas-no-mes-diario', '0 5 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := jsonb_build_object(
      'mode', 'pagas_no_mes',
      'competencias', jsonb_build_array(
        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD'),
        to_char(date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month'), 'YYYY-MM-DD')
      )
    ),
    timeout_milliseconds := 300000
  );
$cron$);

-- Jobs extraordinarios de 20/09. Cada comando remove o proprio agendamento
-- depois que pg_net aceitou o POST; o resultado HTTP segue auditavel em net._http_response.
select cron.schedule('financeiro-emusys-recovery-jul-set-20260920', '0 1 20 9 *', $cron$
  with request as materialized (
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
      ),
      body := '{"mode":"enqueue_range","unidade":"todas","data_inicial":"2026-07-01","data_final":"2026-09-18","catalogos":false,"trigger_source":"recovery_jul_set_20260920","priority":10}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id
  )
  select cron.unschedule('financeiro-emusys-recovery-jul-set-20260920') from request;
$cron$);

select cron.schedule('financeiro-emusys-recovery-close-20260920', '5 3 20 9 *', $cron$
  with request as materialized (
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
      ),
      body := '{"mode":"enqueue_daily","unidade":"todas","hoje":"2026-09-20","catalogos":false,"trigger_source":"recovery_close_20260920","priority":5}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id
  )
  select cron.unschedule('financeiro-emusys-recovery-close-20260920') from request;
$cron$);

select cron.schedule('backfill-faturas-jan-mai-20260920', '30 3 20 9 *', $cron$
  with request as materialized (
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
        'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
      ),
      body := '{"mode":"enqueue_and_work","competencias":["2026-01-01","2026-02-01","2026-03-01","2026-04-01","2026-05-01"],"include_backlog":false,"trigger_source":"backfill_super_folha_dre_2026"}'::jsonb,
      timeout_milliseconds := 240000
    ) as request_id
  )
  select cron.unschedule('backfill-faturas-jan-mai-20260920') from request;
$cron$);
