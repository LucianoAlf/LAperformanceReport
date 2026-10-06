-- Fila durável do espelho do extrato Asaas (Emusys beta).
-- Mesmo ciclo de vida de sync_financeiro_emusys_queue (20260919160000), com
-- convenio_id: null = todos os convênios ativos da unidade.
-- A claim também cede quando outra fila Emusys está rodando — o orçamento de
-- chamadas é por token da unidade e dividido entre os pipelines.

create table public.sync_asaas_extrato_queue (
  id uuid primary key default gen_random_uuid(),
  unidade_codigo text not null,
  convenio_id bigint,                        -- null = todos os ativos da unidade
  data_inicial date not null,
  data_final date not null,
  catalogos boolean not null default false,  -- true = regravar catálogo de convênios
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
  constraint sync_asaas_extrato_queue_unidade_chk check (
    unidade_codigo in ('cg', 'barra', 'recreio')
  ),
  constraint sync_asaas_extrato_queue_datas_chk check (data_inicial <= data_final),
  constraint sync_asaas_extrato_queue_status_chk check (
    status in ('pending', 'running', 'retry_wait', 'succeeded', 'failed')
  ),
  constraint sync_asaas_extrato_queue_priority_chk check (priority between 0 and 10000),
  constraint sync_asaas_extrato_queue_attempts_chk check (
    attempt_count >= 0 and max_retries between 0 and 10 and attempt_count <= max_retries + 1
  ),
  constraint sync_asaas_extrato_queue_retry_after_chk check (
    last_retry_after_seconds is null or last_retry_after_seconds >= 0
  ),
  constraint sync_asaas_extrato_queue_running_chk check (
    (status = 'running' and worker_id is not null and lease_expires_at is not null)
    or (status <> 'running' and worker_id is null and lease_expires_at is null)
  ),
  constraint sync_asaas_extrato_queue_terminal_chk check (
    (status in ('succeeded', 'failed') and completed_at is not null)
    or (status not in ('succeeded', 'failed') and completed_at is null)
  )
);

create unique index sync_asaas_extrato_queue_active_range_uniq
  on public.sync_asaas_extrato_queue
    (unidade_codigo, coalesce(convenio_id, -1), data_inicial, data_final)
  where status in ('pending', 'running', 'retry_wait');

create unique index sync_asaas_extrato_queue_one_running_uniq
  on public.sync_asaas_extrato_queue ((true))
  where status = 'running';

create index sync_asaas_extrato_queue_due_idx
  on public.sync_asaas_extrato_queue (priority, next_attempt_at, created_at)
  where status in ('pending', 'retry_wait');

alter table public.sync_asaas_extrato_queue enable row level security;
revoke all on table public.sync_asaas_extrato_queue from public, anon, authenticated;
grant select, insert, update on table public.sync_asaas_extrato_queue to service_role;

comment on table public.sync_asaas_extrato_queue is
  'Fila serial da varredura do extrato Asaas (Emusys beta). convenio_id null = todos os ativos da unidade. Cede quando outra fila Emusys está rodando — rate limit é por token.';

-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.enqueue_sync_asaas_extrato_job(
  p_unidade_codigo text,
  p_data_inicial date,
  p_data_final date,
  p_catalogos boolean,
  p_trigger_source text,
  p_convenio_id bigint default null,
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
    raise exception 'SYNC_ASAAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_unidade_codigo not in ('cg', 'barra', 'recreio') then
    raise exception 'SYNC_ASAAS_UNIDADE_INVALIDA: %', p_unidade_codigo;
  end if;
  if p_data_inicial is null or p_data_final is null or p_data_inicial > p_data_final then
    raise exception 'SYNC_ASAAS_JANELA_INVALIDA';
  end if;
  -- o extrato muda no próprio dia (liberação de cartão anda), então a rotina
  -- cobre só dias encerrados; o dia corrente entra na varredura seguinte.
  if p_data_final > v_hoje_brt then
    raise exception 'DIA_NAO_ENCERRADO: data_final % deve ser ate %', p_data_final, v_hoje_brt;
  end if;
  if p_convenio_id is not null and p_convenio_id <= 0 then
    raise exception 'SYNC_ASAAS_CONVENIO_INVALIDO';
  end if;
  if nullif(btrim(p_trigger_source), '') is null
     or p_priority is null
     or p_max_retries is null
     or p_priority not between 0 and 10000
     or p_max_retries not between 0 and 10 then
    raise exception 'SYNC_ASAAS_PARAMETROS_INVALIDOS';
  end if;

  insert into public.sync_asaas_extrato_queue as queue (
    unidade_codigo,
    convenio_id,
    data_inicial,
    data_final,
    catalogos,
    trigger_source,
    priority,
    max_retries,
    next_attempt_at
  ) values (
    p_unidade_codigo,
    p_convenio_id,
    p_data_inicial,
    p_data_final,
    coalesce(p_catalogos, false),
    nullif(btrim(p_trigger_source), ''),
    p_priority,
    p_max_retries,
    coalesce(p_next_attempt_at, now())
  )
  on conflict (unidade_codigo, coalesce(convenio_id, -1), data_inicial, data_final)
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

create or replace function public.claim_sync_asaas_extrato_job(
  p_worker_id uuid,
  p_lease_seconds integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_job public.sync_asaas_extrato_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_ASAAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_worker_id is null or p_lease_seconds not between 60 and 600 then
    raise exception 'SYNC_ASAAS_WORKER_INVALIDO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('emusys-api-global-claim', 0));

  -- reaper: devolve à fila jobs cujo worker morreu com o lease
  update public.sync_asaas_extrato_queue queue
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

  -- serialização global das chamadas Emusys: qualquer fila Emusys ocupada cede
  if exists (
    select 1 from public.financeiro_sync_queue q where q.status = 'running'
  ) or exists (
    select 1 from public.sync_faturas_pagas_mes_queue q where q.status = 'running'
  ) or exists (
    select 1 from public.sync_financeiro_emusys_queue q where q.status = 'running'
  ) then
    return null;
  end if;

  select queue.*
  into v_job
  from public.sync_asaas_extrato_queue queue
  where queue.status in ('pending', 'retry_wait')
    and queue.next_attempt_at <= now()
    and queue.attempt_count <= queue.max_retries
    and not exists (
      select 1
      from public.sync_asaas_extrato_queue running
      where running.status = 'running'
    )
  order by queue.priority, queue.next_attempt_at, queue.data_inicial, queue.created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  update public.sync_asaas_extrato_queue queue
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

create or replace function public.renew_sync_asaas_extrato_job_lease(
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
    raise exception 'SYNC_ASAAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_worker_id is null or p_lease_seconds not between 60 and 600 then
    raise exception 'SYNC_ASAAS_WORKER_INVALIDO';
  end if;

  update public.sync_asaas_extrato_queue queue
  set
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where queue.id = p_job_id
    and queue.status = 'running'
    and queue.worker_id = p_worker_id
    and queue.lease_expires_at > now()
  returning to_jsonb(queue.*) into v_result;

  if v_result is null then
    raise exception 'SYNC_ASAAS_LEASE_PERDIDO';
  end if;
  return v_result;
end;
$function$;

create or replace function public.retry_sync_asaas_extrato_job(
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
  v_job public.sync_asaas_extrato_queue%rowtype;
  v_result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SYNC_ASAAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  select queue.* into v_job
  from public.sync_asaas_extrato_queue queue
  where queue.id = p_job_id
    and queue.status = 'running'
    and queue.worker_id = p_worker_id
  for update;

  if not found then
    raise exception 'SYNC_ASAAS_JOB_NAO_REIVINDICADO';
  end if;

  update public.sync_asaas_extrato_queue queue
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

create or replace function public.complete_sync_asaas_extrato_job(
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
    raise exception 'SYNC_ASAAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  update public.sync_asaas_extrato_queue queue
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
    raise exception 'SYNC_ASAAS_JOB_NAO_REIVINDICADO';
  end if;
  return v_result;
end;
$function$;

create or replace function public.fail_sync_asaas_extrato_job(
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
    raise exception 'SYNC_ASAAS_QUEUE_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  update public.sync_asaas_extrato_queue queue
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
    raise exception 'SYNC_ASAAS_JOB_NAO_REIVINDICADO';
  end if;
  return v_result;
end;
$function$;

revoke all on function public.enqueue_sync_asaas_extrato_job(text, date, date, boolean, text, bigint, integer, integer, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_sync_asaas_extrato_job(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.renew_sync_asaas_extrato_job_lease(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.retry_sync_asaas_extrato_job(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_sync_asaas_extrato_job(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_sync_asaas_extrato_job(uuid, uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.enqueue_sync_asaas_extrato_job(text, date, date, boolean, text, bigint, integer, integer, timestamptz)
  to service_role;
grant execute on function public.claim_sync_asaas_extrato_job(uuid, integer)
  to service_role;
grant execute on function public.renew_sync_asaas_extrato_job_lease(uuid, uuid, integer)
  to service_role;
grant execute on function public.retry_sync_asaas_extrato_job(uuid, uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.complete_sync_asaas_extrato_job(uuid, uuid)
  to service_role;
grant execute on function public.fail_sync_asaas_extrato_job(uuid, uuid, text, text, integer)
  to service_role;

-- Serialização no sentido inverso: a fila de lançamentos também cede quando um
-- job do extrato Asaas está rodando (mesmo orçamento por token).
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
  ) or exists (
    select 1
    from public.sync_asaas_extrato_queue asaas
    where asaas.status = 'running'
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
