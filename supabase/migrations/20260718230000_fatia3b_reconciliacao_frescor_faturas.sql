-- Fatia 3b - reconciliacao e frescor de faturas Emusys.
-- emusys_faturas permanece o espelho canonico mutavel do estado mais recente.
-- Frescor e historico por competencia vivem somente nos runs e snapshots abaixo.

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  run_type text not null default 'live',
  status text not null default 'running',
  trigger_source text not null,
  requested_by text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  stale_after timestamptz not null,
  unidades_concluidas integer not null default 0,
  units_summary jsonb not null default '[]'::jsonb,
  snapshot_complete boolean not null default false,
  total_emusys integer not null default 0,
  total_inseridos integer not null default 0,
  total_atualizados integer not null default 0,
  total_ausentes_marcados integer not null default 0,
  baseline_source text,
  erro_detalhe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_runs_competencia_primeiro_dia_chk
    check (competencia = date_trunc('month', competencia)::date),
  constraint sync_runs_run_type_chk check (run_type in ('live', 'baseline')),
  constraint sync_runs_status_chk check (status in ('running', 'succeeded', 'failed')),
  constraint sync_runs_unidades_chk check (unidades_concluidas between 0 and 3),
  constraint sync_runs_totais_chk check (
    total_emusys >= 0
    and total_inseridos >= 0
    and total_atualizados >= 0
    and total_ausentes_marcados >= 0
  ),
  constraint sync_runs_baseline_chk check (
    run_type <> 'baseline'
    or (
      status = 'succeeded'
      and snapshot_complete = false
      and completed_at is not null
      and baseline_source is not null
    )
  ),
  constraint sync_runs_frescor_chk check (
    snapshot_complete = false
    or (
      run_type = 'live'
      and status = 'succeeded'
      and completed_at is not null
      and unidades_concluidas = 3
    )
  )
);

create unique index if not exists sync_runs_global_running_uniq
  on public.sync_runs (status) where status = 'running';

create unique index if not exists sync_runs_baseline_competencia_uniq
  on public.sync_runs (competencia) where run_type = 'baseline';

create index if not exists sync_runs_competencia_sucesso_idx
  on public.sync_runs (competencia, completed_at desc)
  where status = 'succeeded';

create table if not exists public.sync_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sync_runs(id),
  canonical_fatura_id uuid not null references public.emusys_faturas(id),
  competencia date not null,
  unidade_id uuid not null references public.unidades(id),
  unidade_codigo text not null,
  emusys_fatura_id bigint not null,
  emusys_matricula_id bigint,
  emusys_contrato_id bigint,
  emusys_student_id bigint,
  descricao text not null default '',
  status text not null default 'desconhecido',
  data_vencimento date not null,
  data_pagamento date,
  valor_original numeric(12,2) not null default 0,
  valor_pago numeric(12,2),
  juros_e_multa numeric(12,2) not null default 0,
  desconto_aplicado numeric(12,2) not null default 0,
  desconto_fixo numeric(12,2) not null default 0,
  desconto_condicional numeric(12,2) not null default 0,
  payload jsonb not null default '{}'::jsonb,
  source_missing boolean not null default false,
  source_missing_reason text,
  source_last_seen_at timestamptz,
  source_missing_detected_at timestamptz,
  source_missing_resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sync_run_items_identidade_uniq
    unique (run_id, competencia, unidade_id, emusys_fatura_id),
  constraint sync_run_items_competencia_primeiro_dia_chk
    check (competencia = date_trunc('month', competencia)::date),
  constraint sync_run_items_status_chk
    check (status in ('aberta', 'paga', 'cancelada', 'desconhecido', '')),
  constraint sync_run_items_missing_reason_chk check (
    (source_missing = false and source_missing_reason is null)
    or (source_missing = true and nullif(btrim(source_missing_reason), '') is not null)
  )
);

create index if not exists sync_run_items_run_idx
  on public.sync_run_items (run_id, unidade_id, emusys_fatura_id);

create table if not exists public.emusys_fatura_source_events (
  id uuid primary key default gen_random_uuid(),
  canonical_fatura_id uuid not null references public.emusys_faturas(id),
  run_id uuid not null references public.sync_runs(id),
  prior_run_id uuid references public.sync_runs(id),
  competencia date not null,
  unidade_id uuid not null references public.unidades(id),
  emusys_fatura_id bigint not null,
  event_type text not null,
  source_missing boolean not null,
  source_missing_reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint emusys_fatura_source_events_type_chk check (
    event_type in (
      'baseline_imported',
      'confirmed',
      'missing_detected',
      'missing_confirmed',
      'missing_resolved'
    )
  )
);

create index if not exists emusys_fatura_source_events_lookup_idx
  on public.emusys_fatura_source_events
  (competencia, unidade_id, emusys_fatura_id, created_at desc);

create table if not exists public.sync_run_overrides (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sync_runs(id),
  competencia date not null,
  baseline_run_id uuid references public.sync_runs(id),
  baseline_count integer not null,
  missing_count integer not null,
  override_reason text not null,
  actor_role text not null,
  actor_subject text,
  created_at timestamptz not null default now(),
  constraint sync_run_overrides_reason_chk
    check (nullif(btrim(override_reason), '') is not null),
  constraint sync_run_overrides_actor_chk check (actor_role = 'service_role')
);

alter table public.sync_runs enable row level security;
alter table public.sync_run_items enable row level security;
alter table public.emusys_fatura_source_events enable row level security;
alter table public.sync_run_overrides enable row level security;

drop policy if exists sync_runs_service_role_select on public.sync_runs;
create policy sync_runs_service_role_select on public.sync_runs
  for select to service_role using (true);

drop policy if exists sync_run_items_service_role_select on public.sync_run_items;
create policy sync_run_items_service_role_select on public.sync_run_items
  for select to service_role using (true);

drop policy if exists emusys_fatura_source_events_service_role_select
  on public.emusys_fatura_source_events;
create policy emusys_fatura_source_events_service_role_select
  on public.emusys_fatura_source_events
  for select to service_role using (true);

drop policy if exists sync_run_overrides_service_role_select
  on public.sync_run_overrides;
create policy sync_run_overrides_service_role_select
  on public.sync_run_overrides
  for select to service_role using (true);

revoke all on table public.sync_runs from public, anon, authenticated, service_role;
revoke all on table public.sync_run_items from public, anon, authenticated, service_role;
revoke all on table public.emusys_fatura_source_events from public, anon, authenticated, service_role;
revoke all on table public.sync_run_overrides from public, anon, authenticated, service_role;

grant select on table public.sync_runs to service_role;
grant select on table public.sync_run_items to service_role;
grant select on table public.emusys_fatura_source_events to service_role;
grant select on table public.sync_run_overrides to service_role;

comment on table public.sync_runs is
  'Execucoes preservadas do sync financeiro. Somente live completo prova frescor; baseline serve apenas para comparacao.';
comment on table public.sync_run_items is
  'Snapshot imutavel por run/competencia/unidade/fatura, incluindo tombstones de nao confirmacao pela origem.';
comment on table public.emusys_fatura_source_events is
  'Trilha append-only das confirmacoes, ausencias e resolucoes observadas por competencia.';

-- Bootstrap auditado: transforma o espelho legado existente em baseline de
-- comparacao, sem declarar completude nem frescor.
with unit_counts as (
  select
    f.competencia,
    f.unidade_id,
    max(f.unidade_codigo) as unidade_codigo,
    count(*)::integer as linhas,
    min(f.synced_at) as first_synced_at,
    max(f.synced_at) as last_synced_at
  from public.emusys_faturas f
  group by f.competencia, f.unidade_id
), baselines as (
  select
    competencia,
    min(first_synced_at) as started_at,
    max(last_synced_at) as completed_at,
    count(*)::integer as unidades_concluidas,
    sum(linhas)::integer as total_emusys,
    jsonb_agg(
      jsonb_build_object(
        'unidade_id', unidade_id,
        'unidade_codigo', unidade_codigo,
        'linhas', linhas,
        'complete', false,
        'source', 'legacy_emusys_faturas'
      )
      order by unidade_id
    ) as units_summary
  from unit_counts
  group by competencia
)
insert into public.sync_runs (
  competencia,
  run_type,
  status,
  trigger_source,
  requested_by,
  started_at,
  completed_at,
  stale_after,
  unidades_concluidas,
  units_summary,
  snapshot_complete,
  total_emusys,
  total_inseridos,
  baseline_source
)
select
  b.competencia,
  'baseline',
  'succeeded',
  'migration',
  '20260718230000_fatia3b_reconciliacao_frescor_faturas',
  b.started_at,
  b.completed_at,
  b.completed_at,
  least(b.unidades_concluidas, 3),
  b.units_summary,
  false,
  b.total_emusys,
  b.total_emusys,
  'legacy_emusys_faturas_without_completeness_guarantee'
from baselines b
on conflict (competencia) where (run_type = 'baseline') do nothing;

insert into public.sync_run_items (
  run_id,
  canonical_fatura_id,
  competencia,
  unidade_id,
  unidade_codigo,
  emusys_fatura_id,
  emusys_matricula_id,
  emusys_contrato_id,
  emusys_student_id,
  descricao,
  status,
  data_vencimento,
  data_pagamento,
  valor_original,
  valor_pago,
  juros_e_multa,
  desconto_aplicado,
  desconto_fixo,
  desconto_condicional,
  payload,
  source_missing,
  source_missing_reason,
  source_last_seen_at,
  created_at
)
select
  r.id,
  f.id,
  f.competencia,
  f.unidade_id,
  f.unidade_codigo,
  f.emusys_fatura_id,
  f.emusys_matricula_id,
  f.emusys_contrato_id,
  f.emusys_student_id,
  f.descricao,
  f.status,
  f.data_vencimento,
  f.data_pagamento,
  f.valor_original,
  f.valor_pago,
  f.juros_e_multa,
  f.desconto_aplicado,
  f.desconto_fixo,
  f.desconto_condicional,
  f.payload,
  false,
  null,
  f.synced_at,
  f.synced_at
from public.emusys_faturas f
join public.sync_runs r
  on r.competencia = f.competencia
 and r.run_type = 'baseline'
on conflict (run_id, competencia, unidade_id, emusys_fatura_id) do nothing;

insert into public.emusys_fatura_source_events (
  canonical_fatura_id,
  run_id,
  prior_run_id,
  competencia,
  unidade_id,
  emusys_fatura_id,
  event_type,
  source_missing,
  source_missing_reason,
  details,
  created_at
)
select
  i.canonical_fatura_id,
  i.run_id,
  null,
  i.competencia,
  i.unidade_id,
  i.emusys_fatura_id,
  'baseline_imported',
  false,
  null,
  jsonb_build_object('source', 'legacy_emusys_faturas', 'proves_freshness', false),
  i.created_at
from public.sync_run_items i
join public.sync_runs r on r.id = i.run_id
where r.run_type = 'baseline'
  and not exists (
    select 1
    from public.emusys_fatura_source_events e
    where e.run_id = i.run_id
      and e.unidade_id = i.unidade_id
      and e.emusys_fatura_id = i.emusys_fatura_id
      and e.event_type = 'baseline_imported'
  );

create or replace function public.fn_financeiro_snapshot_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'FINANCEIRO_SYNC_IMUTAVEL: % e append-only', tg_table_name;
end;
$$;

drop trigger if exists trg_sync_run_items_append_only on public.sync_run_items;
create trigger trg_sync_run_items_append_only
before update or delete on public.sync_run_items
for each row execute function public.fn_financeiro_snapshot_append_only();

drop trigger if exists trg_emusys_fatura_source_events_append_only
  on public.emusys_fatura_source_events;
create trigger trg_emusys_fatura_source_events_append_only
before update or delete on public.emusys_fatura_source_events
for each row execute function public.fn_financeiro_snapshot_append_only();

drop trigger if exists trg_sync_run_overrides_append_only
  on public.sync_run_overrides;
create trigger trg_sync_run_overrides_append_only
before update or delete on public.sync_run_overrides
for each row execute function public.fn_financeiro_snapshot_append_only();

create or replace function public.fn_financeiro_sync_run_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'FINANCEIRO_SYNC_IMUTAVEL: sync_runs nunca podem ser apagados';
  end if;

  if old.run_type = 'baseline' or old.status <> 'running' then
    raise exception 'FINANCEIRO_SYNC_IMUTAVEL: run finalizado nao pode ser alterado';
  end if;

  if new.id <> old.id
     or new.competencia <> old.competencia
     or new.run_type <> old.run_type
     or new.trigger_source <> old.trigger_source
     or new.requested_by is distinct from old.requested_by
     or new.started_at <> old.started_at
     or new.stale_after <> old.stale_after then
    raise exception 'FINANCEIRO_SYNC_IMUTAVEL: identidade do run nao pode mudar';
  end if;

  if new.status not in ('succeeded', 'failed') then
    raise exception 'FINANCEIRO_SYNC_TRANSICAO_INVALIDA: running exige estado terminal';
  end if;

  if new.status = 'succeeded'
     and (new.snapshot_complete is distinct from true or new.unidades_concluidas <> 3) then
    raise exception 'FINANCEIRO_SYNC_INCOMPLETO: sucesso exige snapshot completo das 3 unidades';
  end if;

  if new.status = 'failed' and new.snapshot_complete then
    raise exception 'FINANCEIRO_SYNC_TRANSICAO_INVALIDA: falha nao pode provar frescor';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_runs_guard on public.sync_runs;
create trigger trg_sync_runs_guard
before update or delete on public.sync_runs
for each row execute function public.fn_financeiro_sync_run_guard();

create or replace function public.start_financeiro_sync_run(
  p_competencia date,
  p_trigger_source text,
  p_requested_by text default null,
  p_stale_timeout_seconds integer default 900
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_SYNC_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_competencia is null or p_competencia <> date_trunc('month', p_competencia)::date then
    raise exception 'FINANCEIRO_SYNC_COMPETENCIA_INVALIDA: use o primeiro dia do mes';
  end if;
  if nullif(btrim(p_trigger_source), '') is null then
    raise exception 'FINANCEIRO_SYNC_TRIGGER_INVALIDO';
  end if;
  if p_stale_timeout_seconds < 300 or p_stale_timeout_seconds > 7200 then
    raise exception 'FINANCEIRO_SYNC_STALE_INVALIDO: use 300..7200 segundos';
  end if;

  update public.sync_runs
  set
    status = 'failed',
    completed_at = now(),
    erro_detalhe = 'stale timeout: run abandonado excedeu stale_after',
    snapshot_complete = false
  where status = 'running'
    and stale_after <= now();

  insert into public.sync_runs (
    competencia,
    run_type,
    status,
    trigger_source,
    requested_by,
    started_at,
    stale_after
  ) values (
    p_competencia,
    'live',
    'running',
    btrim(p_trigger_source),
    nullif(btrim(p_requested_by), ''),
    now(),
    now() + make_interval(secs => p_stale_timeout_seconds)
  )
  returning id into v_run_id;

  return v_run_id;
exception
  when unique_violation then
    raise exception 'FINANCEIRO_SYNC_MUTEX: ja existe um sync financeiro running'
      using errcode = '55P03';
end;
$$;

create or replace function public.fail_financeiro_sync_run(
  p_run_id uuid,
  p_erro_detalhe text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.sync_runs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FINANCEIRO_SYNC_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;

  select * into v_run
  from public.sync_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'FINANCEIRO_SYNC_RUN_INEXISTENTE: %', p_run_id;
  end if;
  if v_run.status = 'failed' then
    return jsonb_build_object('sync_run_id', v_run.id, 'status', v_run.status);
  end if;
  if v_run.status <> 'running' then
    raise exception 'FINANCEIRO_SYNC_RUN_FINALIZADO: %', v_run.status;
  end if;

  update public.sync_runs
  set
    status = 'failed',
    completed_at = now(),
    erro_detalhe = left(coalesce(p_erro_detalhe, 'falha sem detalhe'), 8000),
    snapshot_complete = false
  where id = p_run_id;

  return jsonb_build_object('sync_run_id', p_run_id, 'status', 'failed');
end;
$$;

create or replace function public.publish_financeiro_sync_run(
  p_run_id uuid,
  p_items jsonb,
  p_units_summary jsonb,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.sync_runs%rowtype;
  v_baseline_run_id uuid;
  v_baseline_count integer := 0;
  v_missing_count integer := 0;
  v_total_emusys integer := 0;
  v_existing_count integer := 0;
  v_override_required boolean := false;
  v_actor_role text := auth.role();
  v_actor_subject text := auth.uid()::text;
begin
  if v_actor_role is distinct from 'service_role' then
    raise exception 'FINANCEIRO_SYNC_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'FINANCEIRO_SYNC_PAYLOAD_INVALIDO: items deve ser array';
  end if;
  if jsonb_typeof(p_units_summary) is distinct from 'array' then
    raise exception 'FINANCEIRO_SYNC_PAYLOAD_INVALIDO: units_summary deve ser array';
  end if;

  select * into v_run
  from public.sync_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'FINANCEIRO_SYNC_RUN_INEXISTENTE: %', p_run_id;
  end if;
  if v_run.status <> 'running' or v_run.run_type <> 'live' then
    raise exception 'FINANCEIRO_SYNC_RUN_NAO_PUBLICAVEL: %/%', v_run.run_type, v_run.status;
  end if;

  create temporary table financeiro_sync_publish_items (
    unidade_id uuid not null,
    unidade_codigo text not null,
    emusys_fatura_id bigint not null,
    emusys_matricula_id bigint,
    emusys_contrato_id bigint,
    emusys_student_id bigint,
    descricao text not null,
    status text not null,
    data_vencimento date not null,
    data_pagamento date,
    competencia date not null,
    valor_original numeric(12,2) not null,
    valor_pago numeric(12,2),
    juros_e_multa numeric(12,2) not null,
    desconto_aplicado numeric(12,2) not null,
    desconto_fixo numeric(12,2) not null,
    desconto_condicional numeric(12,2) not null,
    payload jsonb not null
  ) on commit drop;

  insert into financeiro_sync_publish_items
  select
    x.unidade_id,
    lower(btrim(x.unidade_codigo)),
    x.emusys_fatura_id::bigint,
    nullif(x.emusys_matricula_id, '')::bigint,
    nullif(x.emusys_contrato_id, '')::bigint,
    nullif(x.emusys_student_id, '')::bigint,
    coalesce(x.descricao, ''),
    coalesce(nullif(lower(btrim(x.status)), ''), 'desconhecido'),
    x.data_vencimento,
    x.data_pagamento,
    x.competencia,
    coalesce(x.valor_original, 0),
    x.valor_pago,
    coalesce(x.juros_e_multa, 0),
    coalesce(x.desconto_aplicado, 0),
    coalesce(x.desconto_fixo, 0),
    coalesce(x.desconto_condicional, 0),
    coalesce(x.payload, '{}'::jsonb)
  from jsonb_to_recordset(p_items) as x(
    unidade_id uuid,
    unidade_codigo text,
    emusys_fatura_id text,
    emusys_matricula_id text,
    emusys_contrato_id text,
    emusys_student_id text,
    descricao text,
    status text,
    data_vencimento date,
    data_pagamento date,
    competencia date,
    valor_original numeric,
    valor_pago numeric,
    juros_e_multa numeric,
    desconto_aplicado numeric,
    desconto_fixo numeric,
    desconto_condicional numeric,
    payload jsonb
  );

  if exists (
    select 1
    from financeiro_sync_publish_items i
    where i.competencia <> v_run.competencia
       or i.data_vencimento < v_run.competencia
       or i.data_vencimento >= (v_run.competencia + interval '1 month')::date
       or i.emusys_fatura_id <= 0
       or i.status not in ('aberta', 'paga', 'cancelada', 'desconhecido', '')
       or (i.unidade_id, i.unidade_codigo) not in (
         ('2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 'cg'),
         ('95553e96-971b-4590-a6eb-0201d013c14d'::uuid, 'recreio'),
         ('368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 'barra')
       )
  ) then
    raise exception 'FINANCEIRO_SYNC_PAYLOAD_INVALIDO: identidade, data, status ou unidade invalida';
  end if;

  if exists (
    select 1
    from financeiro_sync_publish_items
    group by unidade_id, emusys_fatura_id
    having count(*) > 1
  ) then
    raise exception 'FINANCEIRO_SYNC_PAYLOAD_INVALIDO: ID duplicado dentro da unidade';
  end if;

  if not (
    select
      count(*) = 3
      and count(distinct s.unidade_id) = 3
      and count(*) filter (
        where s.unidade_id in (
          '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid,
          '95553e96-971b-4590-a6eb-0201d013c14d'::uuid,
          '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid
        )
      ) = 3
      and bool_and(s.complete)
    from jsonb_to_recordset(p_units_summary) as s(
      unidade_id uuid,
      processadas integer,
      complete boolean
    )
  ) then
    raise exception 'FINANCEIRO_SYNC_INCOMPLETO: as 3 unidades completas sao obrigatorias';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_units_summary) as s(
      unidade_id uuid,
      processadas integer,
      complete boolean
    )
    where s.processadas is distinct from (
      select count(*)::integer
      from financeiro_sync_publish_items i
      where i.unidade_id = s.unidade_id
    )
  ) then
    raise exception 'FINANCEIRO_SYNC_INCOMPLETO: resumo por unidade diverge dos itens processados';
  end if;

  select r.id into v_baseline_run_id
  from public.sync_runs r
  where r.competencia = v_run.competencia
    and r.status = 'succeeded'
    and r.id <> v_run.id
    and exists (select 1 from public.sync_run_items i where i.run_id = r.id)
  order by (r.run_type = 'live') desc, r.completed_at desc, r.id desc
  limit 1;

  if v_baseline_run_id is not null then
    select count(*)::integer into v_baseline_count
    from public.sync_run_items
    where run_id = v_baseline_run_id;

    select count(*)::integer into v_missing_count
    from public.sync_run_items b
    where b.run_id = v_baseline_run_id
      and not exists (
        select 1
        from financeiro_sync_publish_items i
        where i.unidade_id = b.unidade_id
          and i.emusys_fatura_id = b.emusys_fatura_id
      );
  end if;

  v_override_required := v_baseline_count > 0 and (
    v_missing_count > 20
    or v_missing_count > (v_baseline_count * 0.05)
  );

  if v_override_required and nullif(btrim(p_override_reason), '') is null then
    raise exception
      'FINANCEIRO_SYNC_SANITY_ABORT: % ausentes de % no baseline (>20 OU >5%%)',
      v_missing_count,
      v_baseline_count;
  end if;

  if v_override_required then
    if v_actor_role is distinct from 'service_role' then
      raise exception 'FINANCEIRO_SYNC_OVERRIDE_FORBIDDEN: somente service_role';
    end if;
    insert into public.sync_run_overrides (
      run_id,
      competencia,
      baseline_run_id,
      baseline_count,
      missing_count,
      override_reason,
      actor_role,
      actor_subject
    ) values (
      v_run.id,
      v_run.competencia,
      v_baseline_run_id,
      v_baseline_count,
      v_missing_count,
      btrim(p_override_reason),
      v_actor_role,
      v_actor_subject
    );
  end if;

  select count(*)::integer into v_total_emusys
  from financeiro_sync_publish_items;

  select count(*)::integer into v_existing_count
  from financeiro_sync_publish_items i
  join public.emusys_faturas f
    on f.unidade_id = i.unidade_id
   and f.emusys_fatura_id = i.emusys_fatura_id;

  insert into public.emusys_faturas (
    unidade_id,
    unidade_codigo,
    emusys_fatura_id,
    emusys_matricula_id,
    emusys_contrato_id,
    emusys_student_id,
    descricao,
    status,
    data_vencimento,
    data_pagamento,
    competencia,
    valor_original,
    valor_pago,
    juros_e_multa,
    desconto_aplicado,
    desconto_fixo,
    desconto_condicional,
    payload,
    synced_at
  )
  select
    i.unidade_id,
    i.unidade_codigo,
    i.emusys_fatura_id,
    i.emusys_matricula_id,
    i.emusys_contrato_id,
    i.emusys_student_id,
    i.descricao,
    i.status,
    i.data_vencimento,
    i.data_pagamento,
    i.competencia,
    i.valor_original,
    i.valor_pago,
    i.juros_e_multa,
    i.desconto_aplicado,
    i.desconto_fixo,
    i.desconto_condicional,
    i.payload,
    now()
  from financeiro_sync_publish_items i
  on conflict (unidade_id, emusys_fatura_id) do update set
    unidade_codigo = excluded.unidade_codigo,
    emusys_matricula_id = excluded.emusys_matricula_id,
    emusys_contrato_id = excluded.emusys_contrato_id,
    emusys_student_id = excluded.emusys_student_id,
    descricao = excluded.descricao,
    status = excluded.status,
    data_vencimento = excluded.data_vencimento,
    data_pagamento = excluded.data_pagamento,
    competencia = excluded.competencia,
    valor_original = excluded.valor_original,
    valor_pago = excluded.valor_pago,
    juros_e_multa = excluded.juros_e_multa,
    desconto_aplicado = excluded.desconto_aplicado,
    desconto_fixo = excluded.desconto_fixo,
    desconto_condicional = excluded.desconto_condicional,
    payload = excluded.payload,
    synced_at = excluded.synced_at;

  insert into public.sync_run_items (
    run_id,
    canonical_fatura_id,
    competencia,
    unidade_id,
    unidade_codigo,
    emusys_fatura_id,
    emusys_matricula_id,
    emusys_contrato_id,
    emusys_student_id,
    descricao,
    status,
    data_vencimento,
    data_pagamento,
    valor_original,
    valor_pago,
    juros_e_multa,
    desconto_aplicado,
    desconto_fixo,
    desconto_condicional,
    payload,
    source_missing,
    source_missing_reason,
    source_last_seen_at,
    source_missing_detected_at,
    source_missing_resolved_at
  )
  select
    v_run.id,
    f.id,
    v_run.competencia,
    i.unidade_id,
    i.unidade_codigo,
    i.emusys_fatura_id,
    i.emusys_matricula_id,
    i.emusys_contrato_id,
    i.emusys_student_id,
    i.descricao,
    i.status,
    i.data_vencimento,
    i.data_pagamento,
    i.valor_original,
    i.valor_pago,
    i.juros_e_multa,
    i.desconto_aplicado,
    i.desconto_fixo,
    i.desconto_condicional,
    i.payload,
    false,
    null,
    now(),
    null,
    case when b.source_missing then now() else null end
  from financeiro_sync_publish_items i
  join public.emusys_faturas f
    on f.unidade_id = i.unidade_id
   and f.emusys_fatura_id = i.emusys_fatura_id
  left join public.sync_run_items b
    on b.run_id = v_baseline_run_id
   and b.unidade_id = i.unidade_id
   and b.emusys_fatura_id = i.emusys_fatura_id;

  if v_baseline_run_id is not null then
    insert into public.sync_run_items (
      run_id,
      canonical_fatura_id,
      competencia,
      unidade_id,
      unidade_codigo,
      emusys_fatura_id,
      emusys_matricula_id,
      emusys_contrato_id,
      emusys_student_id,
      descricao,
      status,
      data_vencimento,
      data_pagamento,
      valor_original,
      valor_pago,
      juros_e_multa,
      desconto_aplicado,
      desconto_fixo,
      desconto_condicional,
      payload,
      source_missing,
      source_missing_reason,
      source_last_seen_at,
      source_missing_detected_at,
      source_missing_resolved_at
    )
    select
      v_run.id,
      b.canonical_fatura_id,
      v_run.competencia,
      b.unidade_id,
      b.unidade_codigo,
      b.emusys_fatura_id,
      b.emusys_matricula_id,
      b.emusys_contrato_id,
      b.emusys_student_id,
      b.descricao,
      b.status,
      b.data_vencimento,
      b.data_pagamento,
      b.valor_original,
      b.valor_pago,
      b.juros_e_multa,
      b.desconto_aplicado,
      b.desconto_fixo,
      b.desconto_condicional,
      b.payload,
      true,
      'nao_confirmada_na_origem_nesta_competencia',
      b.source_last_seen_at,
      coalesce(b.source_missing_detected_at, now()),
      null
    from public.sync_run_items b
    where b.run_id = v_baseline_run_id
      and not exists (
        select 1
        from financeiro_sync_publish_items i
        where i.unidade_id = b.unidade_id
          and i.emusys_fatura_id = b.emusys_fatura_id
      );
  end if;

  insert into public.emusys_fatura_source_events (
    canonical_fatura_id,
    run_id,
    prior_run_id,
    competencia,
    unidade_id,
    emusys_fatura_id,
    event_type,
    source_missing,
    source_missing_reason,
    details
  )
  select
    n.canonical_fatura_id,
    n.run_id,
    v_baseline_run_id,
    n.competencia,
    n.unidade_id,
    n.emusys_fatura_id,
    case
      when n.source_missing and coalesce(b.source_missing, false) then 'missing_confirmed'
      when n.source_missing then 'missing_detected'
      when coalesce(b.source_missing, false) then 'missing_resolved'
      else 'confirmed'
    end,
    n.source_missing,
    n.source_missing_reason,
    jsonb_build_object('baseline_run_id', v_baseline_run_id)
  from public.sync_run_items n
  left join public.sync_run_items b
    on b.run_id = v_baseline_run_id
   and b.unidade_id = n.unidade_id
   and b.emusys_fatura_id = n.emusys_fatura_id
  where n.run_id = v_run.id;

  update public.sync_runs
  set
    status = 'succeeded',
    completed_at = now(),
    unidades_concluidas = 3,
    units_summary = p_units_summary,
    snapshot_complete = true,
    total_emusys = v_total_emusys,
    total_inseridos = v_total_emusys - v_existing_count,
    total_atualizados = v_existing_count,
    total_ausentes_marcados = v_missing_count,
    erro_detalhe = null
  where id = v_run.id;

  return jsonb_build_object(
    'sync_run_id', v_run.id,
    'status', 'succeeded',
    'competencia', v_run.competencia,
    'snapshot_complete', true,
    'unidades_concluidas', 3,
    'total_emusys', v_total_emusys,
    'total_inseridos', v_total_emusys - v_existing_count,
    'total_atualizados', v_existing_count,
    'total_ausentes_marcados', v_missing_count,
    'baseline_run_id', v_baseline_run_id,
    'baseline_count', v_baseline_count,
    'sanity_override', v_override_required
  );
end;
$$;

revoke all on function public.start_financeiro_sync_run(date, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.fail_financeiro_sync_run(uuid, text)
  from public, anon, authenticated;
revoke all on function public.publish_financeiro_sync_run(uuid, jsonb, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.start_financeiro_sync_run(date, text, text, integer)
  to service_role;
grant execute on function public.fail_financeiro_sync_run(uuid, text)
  to service_role;
grant execute on function public.publish_financeiro_sync_run(uuid, jsonb, jsonb, text)
  to service_role;

comment on function public.start_financeiro_sync_run(date, text, text, integer) is
  'Cria e commita o run running em operacao separada; expira run stale e respeita mutex global.';
comment on function public.publish_financeiro_sync_run(uuid, jsonb, jsonb, text) is
  'Publica atomicamente espelho, snapshot, tombstones, eventos e sucesso das 3 unidades.';
comment on function public.fail_financeiro_sync_run(uuid, text) is
  'Marca falha em operacao separada para que o rollback da publicacao nao apague sua evidencia.';

-- Um unico job chama o refresh, que processa competencias atual e anterior
-- sequencialmente. O segredo dedicado e lido do Vault em tempo de execucao.
do $do$
declare
  v_job_name text := 'refresh-contas-receber-atual-anterior';
  v_command text;
begin
  if exists (select 1 from cron.job where jobname = v_job_name) then
    perform cron.unschedule(v_job_name);
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'super_folha_contas_receber_secret'
  ) then
    raise notice 'Cron financeiro nao criado: secret super_folha_contas_receber_secret ausente no Vault.';
    return;
  end if;

  v_command := $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/refresh-contas-receber',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-super-folha-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'super_folha_contas_receber_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('competencias', jsonb_build_array('atual', 'anterior'))
    );
  $cron$;

  perform cron.schedule(v_job_name, '15 8 * * *', v_command);
end;
$do$;
