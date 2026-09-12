-- Gate 3D da Sol: acervo persistente append-only para rodadas de governanca.
--
-- Escopo deliberadamente estreito:
--   * recebe somente rodadas read-only e evidencias sanitizadas;
--   * nao envia mensagens, nao promove regra e nao toca o Caixa;
--   * toda escrita passa por uma RPC service_role-only;
--   * UPDATE, DELETE e TRUNCATE sao bloqueados inclusive para o owner.

create extension if not exists pgcrypto with schema extensions;

create table public.sol_governanca_eventos (
  record_id text primary key,
  sequence bigint not null unique,
  recorded_at timestamptz not null default clock_timestamp(),
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  actor_role text not null,
  retention_class text not null,
  payload jsonb not null,
  previous_digest text not null,
  digest text not null unique,
  ingestion_key text unique,
  schema_version smallint not null default 1,
  constraint sol_governanca_eventos_sequence_positive check (sequence > 0),
  constraint sol_governanca_eventos_schema check (schema_version = 1),
  constraint sol_governanca_eventos_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint sol_governanca_eventos_digest_format check (
    previous_digest ~ '^[0-9a-f]{64}$' and digest ~ '^[0-9a-f]{64}$'
  ),
  constraint sol_governanca_eventos_retention check (
    retention_class in ('operational_90d', 'governance_2y', 'permanent_decision')
  ),
  constraint sol_governanca_eventos_actor check (
    actor_role in ('auditor', 'estruturador', 'sonda', 'Alf', 'promotor')
  ),
  constraint sol_governanca_eventos_entity_event check (
    (entity_type = 'case' and event_type in ('case_observed', 'case_structured', 'case_superseded'))
    or (entity_type = 'run' and event_type in ('run_started', 'measurement_recorded', 'run_finished'))
    or (entity_type = 'finding' and event_type in ('finding_opened', 'finding_resolved'))
    or (entity_type = 'promotion' and event_type in (
      'promotion_approved', 'promotion_applied', 'promotion_measured', 'promotion_rolled_back'
    ))
  ),
  constraint sol_governanca_eventos_entity_id check (
    entity_id ~ '^(case|run|finding|promotion):[a-zA-Z0-9._:-]{1,180}$'
    and split_part(entity_id, ':', 1) = entity_type
  )
);

comment on table public.sol_governanca_eventos is
  'Gate 3D: trilha append-only sanitizada da governanca da Sol. Nao contem mensagens, PII ou payload operacional bruto.';

create index sol_governanca_eventos_entity_idx
  on public.sol_governanca_eventos (entity_type, entity_id, sequence desc);
create index sol_governanca_eventos_recorded_idx
  on public.sol_governanca_eventos (recorded_at desc);
create unique index sol_governanca_run_started_unique
  on public.sol_governanca_eventos (entity_id)
  where event_type = 'run_started';

alter table public.sol_governanca_eventos enable row level security;
alter table public.sol_governanca_eventos force row level security;
revoke all on table public.sol_governanca_eventos from public, anon, authenticated, service_role;

create or replace function public.sol_governanca_bloquear_mutacao_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'SOL_GOVERNANCA_APPEND_ONLY';
end;
$function$;

create trigger sol_governanca_eventos_no_update_delete
before update or delete on public.sol_governanca_eventos
for each row execute function public.sol_governanca_bloquear_mutacao_v1();

create trigger sol_governanca_eventos_no_truncate
before truncate on public.sol_governanca_eventos
for each statement execute function public.sol_governanca_bloquear_mutacao_v1();

create or replace function public.sol_governanca_payload_sanitizado_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_key text;
  v_child jsonb;
  v_text text;
begin
  if p_value is null then
    return false;
  end if;

  if length(p_value::text) > 12000 then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      if lower(v_key) = any (array[
        'chat_id', 'cpf', 'email', 'jid', 'message', 'name', 'phone', 'raw',
        'secret', 'token', 'transcript', 'telefone', 'nome', 'mensagem'
      ]) then
        return false;
      end if;
      if not public.sol_governanca_payload_sanitizado_v1(v_child) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if not public.sol_governanca_payload_sanitizado_v1(v_child) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'string' then
    v_text := p_value #>> '{}';
    if length(v_text) > 1000
       or v_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
       or v_text ~* '(^|[^0-9])([0-9]{3}\.){2}[0-9]{3}-[0-9]{2}([^0-9]|$)'
       or v_text ~* '[0-9]{8,}@(s\.whatsapp\.net|g\.us)'
       or v_text ~* '(^|[^0-9])([+]?[0-9]{2}[ .-]?)?[(]?[0-9]{2}[)]?[ .-]?9?[0-9]{4}[ .-]?[0-9]{4}([^0-9]|$)'
       or v_text ~* '(service[_ -]?role|bearer|api[_ -]?key|password|senha)[ :=]+[^ ]{8,}' then
      return false;
    end if;
  end if;
  return true;
end;
$function$;

create or replace function public.sol_governanca_append_evento_interno_v1(
  p_entity_type text,
  p_entity_id text,
  p_event_type text,
  p_actor_role text,
  p_retention_class text,
  p_payload jsonb,
  p_ingestion_key text default null
) returns public.sol_governanca_eventos
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  v_previous text;
  v_sequence bigint;
  v_record_id text := 'record:' || gen_random_uuid()::text;
  v_recorded_at timestamptz := clock_timestamp();
  v_digest text;
  v_row public.sol_governanca_eventos;
begin
  if not public.sol_governanca_payload_sanitizado_v1(p_payload) then
    raise exception using errcode = '22023', message = 'SOL_GOVERNANCA_PAYLOAD_NAO_SANITIZADO';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sol_governanca_eventos:v1', 20260912032000));

  select e.sequence + 1, e.digest
    into v_sequence, v_previous
  from public.sol_governanca_eventos e
  order by e.sequence desc
  limit 1;

  v_sequence := coalesce(v_sequence, 1);
  v_previous := coalesce(v_previous, repeat('0', 64));
  v_digest := encode(extensions.digest(convert_to(jsonb_build_object(
    'record_id', v_record_id,
    'sequence', v_sequence,
    'recorded_at', to_char(v_recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'event_type', p_event_type,
    'actor_role', p_actor_role,
    'retention_class', p_retention_class,
    'payload', p_payload,
    'previous_digest', v_previous,
    'schema_version', 1
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.sol_governanca_eventos (
    record_id, sequence, recorded_at, entity_type, entity_id, event_type,
    actor_role, retention_class, payload, previous_digest, digest, ingestion_key
  ) values (
    v_record_id, v_sequence, v_recorded_at, p_entity_type, p_entity_id, p_event_type,
    p_actor_role, p_retention_class, p_payload, v_previous, v_digest, p_ingestion_key
  ) returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.sol_governanca_registrar_rodada_v1(
  p_run_id text,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_status text,
  p_measurements jsonb,
  p_run_signature text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_item jsonb;
  v_index integer := 0;
  v_event public.sol_governanca_eventos;
  v_started public.sol_governanca_eventos;
  v_existing public.sol_governanca_eventos;
  v_check_id text;
  v_check_status text;
  v_negative_ok boolean := false;
  v_findings integer := 0;
  v_measurement_count integer;
  v_finding_id text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SOL_GOVERNANCA_SERVICE_ROLE_REQUIRED';
  end if;
  if p_run_id !~ '^run:[a-zA-Z0-9._:-]{1,180}$'
     or p_run_signature !~ '^[0-9a-f]{64}$'
     or p_status not in ('ok', 'failed', 'infra_failed', 'inconclusive')
     or p_started_at is null
     or p_finished_at is null
     or p_finished_at < p_started_at
     or p_finished_at - p_started_at > interval '10 minutes'
     or p_started_at > now() + interval '5 minutes'
     or p_finished_at < now() - interval '24 hours'
     or jsonb_typeof(p_measurements) <> 'array' then
    raise exception using errcode = '22023', message = 'SOL_GOVERNANCA_RODADA_INVALIDA';
  end if;

  v_measurement_count := jsonb_array_length(p_measurements);
  if v_measurement_count < 1 or v_measurement_count > 30 then
    raise exception using errcode = '22023', message = 'SOL_GOVERNANCA_MEDICOES_INVALIDAS';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sol_governanca_run:' || p_run_signature, 20260912032000));
  select * into v_existing
  from public.sol_governanca_eventos e
  where e.ingestion_key = 'run:' || p_run_signature || ':started';
  if found then
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'run_id', p_run_id,
      'first_sequence', v_existing.sequence,
      'chain', public.sol_governanca_verificar_acervo_v1()
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_measurements)
  loop
    v_index := v_index + 1;
    if jsonb_typeof(v_item) <> 'object'
       or not (v_item ? 'check_id' and v_item ? 'status' and v_item ? 'evidence')
       or (v_item->>'check_id') !~ '^[a-z0-9_:-]{1,80}$'
       or (v_item->>'status') not in ('ok', 'failed', 'infra_failed', 'inconclusive')
       or jsonb_typeof(v_item->'evidence') <> 'object'
       or not public.sol_governanca_payload_sanitizado_v1(v_item) then
      raise exception using errcode = '22023', message = 'SOL_GOVERNANCA_MEDICAO_NAO_SANITIZADA';
    end if;
    if v_item->>'check_id' = 'planted_negative'
       and v_item->>'status' = 'ok'
       and coalesce((v_item->'evidence'->>'rejected')::boolean, false) then
      v_negative_ok := true;
    end if;
  end loop;

  if p_status = 'ok' and not v_negative_ok then
    raise exception using errcode = '22023', message = 'SOL_GOVERNANCA_VERDE_SEM_NEGATIVO';
  end if;

  select * into v_started from public.sol_governanca_append_evento_interno_v1(
    'run', p_run_id, 'run_started', 'sonda', 'operational_90d',
    jsonb_build_object(
      'mode', 'scheduled_readonly', 'model_used', false,
      'effects_enabled', false, 'governance_store_written', true,
      'operational_database_touched', false, 'messaging_egress_sent', false,
      'started_at', to_char(p_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    'run:' || p_run_signature || ':started'
  );

  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_measurements)
  loop
    v_index := v_index + 1;
    v_check_id := v_item->>'check_id';
    v_check_status := v_item->>'status';
    perform public.sol_governanca_append_evento_interno_v1(
      'run', p_run_id, 'measurement_recorded', 'sonda', 'operational_90d',
      jsonb_build_object('check_id', v_check_id, 'status', v_check_status, 'evidence', v_item->'evidence'),
      'run:' || p_run_signature || ':measurement:' || lpad(v_index::text, 3, '0')
    );
    if v_check_status <> 'ok' then
      v_findings := v_findings + 1;
      v_finding_id := 'finding:' || substr(p_run_signature, 1, 16) || ':' || v_check_id;
      perform public.sol_governanca_append_evento_interno_v1(
        'finding', v_finding_id, 'finding_opened', 'auditor', 'governance_2y',
        jsonb_build_object(
          'run_id', p_run_id, 'check_id', v_check_id, 'status', 'open',
          'observed_status', v_check_status, 'owner_role', 'Alfredo',
          'criterion', 'A medicao precisa terminar ok em uma rodada posterior.'
        ),
        'run:' || p_run_signature || ':finding:' || lpad(v_index::text, 3, '0')
      );
    end if;
  end loop;

  select * into v_event from public.sol_governanca_append_evento_interno_v1(
    'run', p_run_id, 'run_finished', 'sonda', 'operational_90d',
    jsonb_build_object(
      'status', p_status, 'negative_probe_rejected', v_negative_ok,
      'effects_enabled', false, 'governance_store_written', true,
      'operational_database_touched', false, 'messaging_egress_sent', false,
      'finished_at', to_char(p_finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'measurement_count', v_measurement_count, 'finding_count', v_findings
    ),
    'run:' || p_run_signature || ':finished'
  );

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'run_id', p_run_id,
    'first_sequence', v_started.sequence, 'last_sequence', v_event.sequence,
    'measurement_count', v_measurement_count, 'finding_count', v_findings,
    'chain', public.sol_governanca_verificar_acervo_v1()
  );
end;
$function$;

create or replace function public.sol_governanca_verificar_acervo_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $function$
  with ordered as (
    select
      e.*,
      lag(e.digest) over (order by e.sequence) as expected_previous,
      row_number() over (order by e.sequence) as expected_sequence
    from public.sol_governanca_eventos e
  ), checked as (
    select
      o.*,
      encode(extensions.digest(convert_to(jsonb_build_object(
        'record_id', o.record_id,
        'sequence', o.sequence,
        'recorded_at', to_char(o.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'entity_type', o.entity_type,
        'entity_id', o.entity_id,
        'event_type', o.event_type,
        'actor_role', o.actor_role,
        'retention_class', o.retention_class,
        'payload', o.payload,
        'previous_digest', o.previous_digest,
        'schema_version', o.schema_version
      )::text, 'UTF8'), 'sha256'), 'hex') as expected_digest
    from ordered o
  )
  select jsonb_build_object(
    'ok', coalesce(bool_and(
      sequence = expected_sequence
      and previous_digest = coalesce(expected_previous, repeat('0', 64))
      and digest = expected_digest
    ), true),
    'events', count(*),
    'first_sequence', min(sequence),
    'last_sequence', max(sequence),
    'last_digest', (array_agg(digest order by sequence desc))[1]
  )
  from checked;
$function$;

create or replace function public.sol_governanca_readback_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schema_version', 1,
    'store_mode', 'append_only',
    'effects_enabled', false,
    'egress_enabled', false,
    'chain', public.sol_governanca_verificar_acervo_v1(),
    'latest_run', (
      select jsonb_build_object(
        'run_id', e.entity_id,
        'status', e.payload->>'status',
        'recorded_at', e.recorded_at,
        'sequence', e.sequence,
        'finding_count', coalesce((e.payload->>'finding_count')::integer, 0)
      )
      from public.sol_governanca_eventos e
      where e.event_type = 'run_finished'
      order by e.sequence desc
      limit 1
    ),
    'hot_events', (
      select count(*)
      from public.sol_governanca_eventos e
      where case e.retention_class
        when 'operational_90d' then e.recorded_at >= now() - interval '90 days'
        when 'governance_2y' then e.recorded_at >= now() - interval '2 years'
        else true
      end
    )
  );
$function$;

revoke all on function public.sol_governanca_bloquear_mutacao_v1() from public, anon, authenticated, service_role;
revoke all on function public.sol_governanca_payload_sanitizado_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.sol_governanca_append_evento_interno_v1(text,text,text,text,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.sol_governanca_registrar_rodada_v1(text,timestamptz,timestamptz,text,jsonb,text) from public, anon, authenticated, service_role;
revoke all on function public.sol_governanca_verificar_acervo_v1() from public, anon, authenticated, service_role;
revoke all on function public.sol_governanca_readback_v1() from public, anon, authenticated, service_role;

grant execute on function public.sol_governanca_registrar_rodada_v1(text,timestamptz,timestamptz,text,jsonb,text) to service_role;
grant execute on function public.sol_governanca_verificar_acervo_v1() to service_role;
grant execute on function public.sol_governanca_readback_v1() to service_role;

comment on function public.sol_governanca_registrar_rodada_v1(text,timestamptz,timestamptz,text,jsonb,text) is
  'Gate 3D: registra atomicamente uma rodada read-only sanitizada; nao promove, nao envia e nao toca dominios operacionais.';
