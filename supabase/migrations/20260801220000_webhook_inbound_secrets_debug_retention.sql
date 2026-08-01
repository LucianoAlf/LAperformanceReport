-- Subprojeto B / Task 2
--
-- 1. Guarda somente o SHA-256 do segredo inbound por caixa.
-- 2. Expoe uma validacao booleana minima ao role anon usado antes da service role.
-- 3. Expurga o debug legado, que reteve payloads pessoais completos sem prazo.
-- 4. Cria diagnostico tipado e sanitizado com retencao maxima de sete dias.

create table public.whatsapp_caixa_webhook_secrets (
  caixa_id integer primary key
    references public.whatsapp_caixas(id) on delete cascade,
  secret_hash_sha256 text not null
    check (secret_hash_sha256 ~ '^[0-9a-f]{64}$'),
  ativo boolean not null default true,
  versao integer not null default 1 check (versao > 0),
  criado_em timestamptz not null default now(),
  rotacionado_em timestamptz not null default now()
);

alter table public.whatsapp_caixa_webhook_secrets enable row level security;

revoke all on table public.whatsapp_caixa_webhook_secrets
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito,
       maria_lareport_rpc, ml_jobs;

grant select, insert, update, delete
  on table public.whatsapp_caixa_webhook_secrets
  to service_role;

comment on table public.whatsapp_caixa_webhook_secrets is
  'Hash SHA-256 do segredo inbound por caixa. O segredo bruto nunca e persistido no banco.';

create or replace function public.validar_webhook_caixa_hash(
  p_caixa_id integer,
  p_secret_hash_sha256 text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(
    p_caixa_id > 0
    and p_secret_hash_sha256 ~ '^[0-9a-f]{64}$'
    and exists (
      select 1
      from public.whatsapp_caixa_webhook_secrets ws
      join public.whatsapp_caixas wc on wc.id = ws.caixa_id
      where ws.caixa_id = p_caixa_id
        and ws.ativo is true
        and wc.ativo is true
        and ws.secret_hash_sha256 = p_secret_hash_sha256
    ),
    false
  );
$function$;

revoke all on function public.validar_webhook_caixa_hash(integer, text)
  from public, authenticated, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito, maria_lareport_rpc, ml_jobs;

grant execute on function public.validar_webhook_caixa_hash(integer, text)
  to anon, service_role;

comment on function public.validar_webhook_caixa_hash(integer, text) is
  'Compara hash inbound por caixa e retorna somente boolean. Nao recebe nem devolve segredo bruto.';

do $assert_legacy_table$
begin
  if to_regclass('public.webhook_debug_log') is null then
    raise exception 'webhook_debug_log nao existe; expurgo abortado';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'webhook_debug_log'
  ) then
    raise exception 'webhook_debug_log possui policy inesperada; expurgo abortado';
  end if;
end;
$assert_legacy_table$;

alter table public.webhook_debug_log enable row level security;

-- A tabela legada nao e mais destino de escrita. Revogar service_role impede
-- que uma Edge futura reintroduza o payload bruto por engano.
revoke all on table public.webhook_debug_log
  from public, anon, authenticated, service_role, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito,
       maria_lareport_rpc, ml_jobs;

do $expurge_legacy$
declare
  v_debug_count bigint;
  v_debug_min timestamptz;
  v_debug_max timestamptz;
  v_database_writer text;
begin
  lock table public.webhook_debug_log in access exclusive mode;

  select string_agg(
           format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
           ', '
         )
    into v_database_writer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind in ('f', 'p')
    and n.nspname not in ('pg_catalog', 'information_schema')
    and pg_get_functiondef(p.oid) ~* (
      '(insert[[:space:]]+into|update|delete[[:space:]]+from|'
      || 'truncate([[:space:]]+table)?)[[:space:]]+'
      || '(public[.])?webhook_debug_log'
    );

  if v_database_writer is not null then
    raise exception
      'escritor persistente de webhook_debug_log detectado: %',
      v_database_writer;
  end if;

  select count(*), min(created_at), max(created_at)
    into v_debug_count, v_debug_min, v_debug_max
  from public.webhook_debug_log;

  raise notice
    'webhook_debug_log preflight: % linhas, created_at entre % e %',
    v_debug_count,
    v_debug_min,
    v_debug_max;

  if v_debug_count > 0 then
    raise notice
      'expurgando % linhas de webhook_debug_log; payload nao sera copiado',
      v_debug_count;
    truncate table public.webhook_debug_log;
  else
    raise notice 'webhook_debug_log vazia; expurgo ignorado';
  end if;
end;
$expurge_legacy$;

create type public.webhook_diagnostic_event_type as enum (
  'messages',
  'messages_update',
  'unknown'
);

create type public.webhook_diagnostic_route as enum (
  'admin',
  'crm',
  'evasao',
  'pesquisa_primeira_aula',
  'ignored'
);

create type public.webhook_diagnostic_result as enum (
  'accepted',
  'duplicate',
  'rejected',
  'error'
);

create type public.webhook_diagnostic_error_code as enum (
  'invalid_payload',
  'provider_error',
  'database_error',
  'internal_error'
);

create table public.webhook_diagnosticos_sanitizados (
  id bigint generated by default as identity primary key,
  correlation_id uuid not null,
  caixa_id integer null
    references public.whatsapp_caixas(id) on delete set null,
  event_type public.webhook_diagnostic_event_type not null,
  route public.webhook_diagnostic_route not null,
  result public.webhook_diagnostic_result not null,
  http_status smallint null check (http_status between 100 and 599),
  error_code public.webhook_diagnostic_error_code null,
  duration_ms bigint null check (duration_ms >= 0),
  provider_message_id_hash char(64) null
    check (provider_message_id_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now()
);

create index webhook_diagnosticos_sanitizados_occurred_at_idx
  on public.webhook_diagnosticos_sanitizados (occurred_at);

alter table public.webhook_diagnosticos_sanitizados enable row level security;

revoke all on table public.webhook_diagnosticos_sanitizados
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito,
       maria_lareport_rpc, ml_jobs;

revoke all on sequence public.webhook_diagnosticos_sanitizados_id_seq
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito,
       maria_lareport_rpc, ml_jobs;

grant select, insert, update, delete
  on table public.webhook_diagnosticos_sanitizados
  to service_role;

grant usage, select
  on sequence public.webhook_diagnosticos_sanitizados_id_seq
  to service_role;

comment on table public.webhook_diagnosticos_sanitizados is
  'Diagnosticos operacionais tipados, sem conteudo pessoal, com retencao maxima de sete dias.';

create or replace function public.expurgar_webhook_diagnosticos_sanitizados()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_deleted bigint;
begin
  delete from public.webhook_diagnosticos_sanitizados
  where occurred_at < now() - interval '7 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.expurgar_webhook_diagnosticos_sanitizados()
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito,
       maria_lareport_rpc, ml_jobs;

grant execute on function public.expurgar_webhook_diagnosticos_sanitizados()
  to service_role;

do $schedule_retention$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is null then
    raise exception 'schema cron ausente; retencao automatica nao pode ser agendada';
  end if;

  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'expurgar-webhook-diagnosticos-sanitizados'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'expurgar-webhook-diagnosticos-sanitizados',
    '17 4 * * *',
    'select public.expurgar_webhook_diagnosticos_sanitizados();'
  );
end;
$schedule_retention$;
