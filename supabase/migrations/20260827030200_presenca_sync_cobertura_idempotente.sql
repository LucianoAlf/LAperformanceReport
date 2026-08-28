-- Ledger privado de cobertura do sync Emusys.
-- Uma execucao parcial nunca e publicavel e uma lease impede dois escritores
-- para a mesma unidade/modo/data.

create table public.presenca_sync_execucoes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  unidade_id uuid not null references public.unidades(id),
  modo text not null check (modo in ('presenca', 'metadados', 'agenda')),
  data_alvo date not null,
  status text not null check (status in ('iniciada', 'concluida', 'falhou', 'abortada')),
  snapshot_hash text check (snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$'),
  paginas_lidas integer not null default 0 check (paginas_lidas >= 0),
  aulas_lidas integer not null default 0 check (aulas_lidas >= 0),
  presencas_lidas integer not null default 0 check (presencas_lidas >= 0),
  erro_codigo text check (erro_codigo is null or erro_codigo ~ '^[A-Z0-9_]{1,64}$'),
  lease_segundos integer not null check (lease_segundos between 30 and 3600),
  criada_em timestamptz not null default clock_timestamp(),
  heartbeat_em timestamptz,
  finalizada_em timestamptz,
  unique (request_id, unidade_id, modo, data_alvo)
);

create index presenca_sync_execucoes_alvo_idx
  on public.presenca_sync_execucoes (unidade_id, modo, data_alvo, criada_em desc);

create table public.presenca_sync_eventos (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.presenca_sync_execucoes(id),
  tipo text not null check (tipo in ('iniciada', 'heartbeat', 'concluida', 'falhou', 'abortada', 'deduplicada')),
  detalhes jsonb not null default '{}'::jsonb check (jsonb_typeof(detalhes) = 'object'),
  criado_em timestamptz not null default clock_timestamp()
);

create index presenca_sync_eventos_run_idx
  on public.presenca_sync_eventos (run_id, criado_em);

create table public.presenca_sync_cobertura (
  unidade_id uuid not null references public.unidades(id),
  modo text not null check (modo in ('presenca', 'metadados', 'agenda')),
  data_alvo date not null,
  run_id uuid not null references public.presenca_sync_execucoes(id),
  status text not null check (status in ('iniciada', 'concluida', 'falhou', 'abortada')),
  lease_ate timestamptz,
  heartbeat_em timestamptz,
  snapshot_hash text check (snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$'),
  paginas_lidas integer not null default 0 check (paginas_lidas >= 0),
  aulas_lidas integer not null default 0 check (aulas_lidas >= 0),
  presencas_lidas integer not null default 0 check (presencas_lidas >= 0),
  iniciada_em timestamptz not null,
  finalizada_em timestamptz,
  atualizada_em timestamptz not null default clock_timestamp(),
  primary key (unidade_id, modo, data_alvo)
);

alter table public.presenca_sync_execucoes enable row level security;
alter table public.presenca_sync_eventos enable row level security;
alter table public.presenca_sync_cobertura enable row level security;

create or replace function public.presenca_sync_iniciar_v1(
  p_unidade_id uuid,
  p_modo text,
  p_data_alvo date,
  p_request_id uuid,
  p_lease_segundos integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existente public.presenca_sync_execucoes%rowtype;
  v_cobertura public.presenca_sync_cobertura%rowtype;
  v_run_id uuid;
  v_agora timestamptz := clock_timestamp();
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_alvo is null or p_request_id is null
     or p_modo not in ('presenca', 'metadados', 'agenda')
     or p_lease_segundos not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'parametros de sync invalidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_unidade_id::text || ':' || p_modo || ':' || p_data_alvo::text, 0
  ));

  select * into v_existente
    from public.presenca_sync_execucoes
   where request_id = p_request_id
     and unidade_id = p_unidade_id
     and modo = p_modo
     and data_alvo = p_data_alvo;
  if found then
    insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
    values (v_existente.id, 'deduplicada', jsonb_build_object('motivo', 'request_id_repetido'));
    return jsonb_build_object(
      'adquirida', false, 'motivo', 'request_id_repetido',
      'run_id', v_existente.id, 'status', v_existente.status
    );
  end if;

  select * into v_cobertura
    from public.presenca_sync_cobertura
   where unidade_id = p_unidade_id and modo = p_modo and data_alvo = p_data_alvo
   for update;

  if found and v_cobertura.status = 'iniciada' and v_cobertura.lease_ate > v_agora then
    insert into public.presenca_sync_execucoes(
      request_id, unidade_id, modo, data_alvo, status, erro_codigo,
      lease_segundos, finalizada_em
    ) values (
      p_request_id, p_unidade_id, p_modo, p_data_alvo, 'abortada', 'LEASE_ATIVO',
      p_lease_segundos, v_agora
    ) returning id into v_run_id;
    insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
    values (v_run_id, 'deduplicada', jsonb_build_object(
      'motivo', 'lease_ativo', 'run_ativo', v_cobertura.run_id
    ));
    return jsonb_build_object(
      'adquirida', false, 'motivo', 'lease_ativo',
      'run_id', v_run_id, 'run_ativo', v_cobertura.run_id
    );
  end if;

  if found and v_cobertura.status = 'iniciada' then
    update public.presenca_sync_execucoes
       set status = 'abortada', erro_codigo = 'LEASE_EXPIRADA', finalizada_em = v_agora
     where id = v_cobertura.run_id and status = 'iniciada';
    if found then
      insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
      values (v_cobertura.run_id, 'abortada', jsonb_build_object('motivo', 'lease_expirada'));
    end if;
  end if;

  insert into public.presenca_sync_execucoes(
    request_id, unidade_id, modo, data_alvo, status, lease_segundos, heartbeat_em
  ) values (
    p_request_id, p_unidade_id, p_modo, p_data_alvo, 'iniciada', p_lease_segundos, v_agora
  ) returning id into v_run_id;

  insert into public.presenca_sync_cobertura(
    unidade_id, modo, data_alvo, run_id, status, lease_ate, heartbeat_em,
    snapshot_hash, paginas_lidas, aulas_lidas, presencas_lidas,
    iniciada_em, finalizada_em, atualizada_em
  ) values (
    p_unidade_id, p_modo, p_data_alvo, v_run_id, 'iniciada',
    v_agora + make_interval(secs => p_lease_segundos), v_agora,
    null, 0, 0, 0, v_agora, null, v_agora
  ) on conflict (unidade_id, modo, data_alvo) do update set
    run_id = excluded.run_id,
    status = excluded.status,
    lease_ate = excluded.lease_ate,
    heartbeat_em = excluded.heartbeat_em,
    snapshot_hash = null,
    paginas_lidas = 0,
    aulas_lidas = 0,
    presencas_lidas = 0,
    iniciada_em = excluded.iniciada_em,
    finalizada_em = null,
    atualizada_em = excluded.atualizada_em;

  insert into public.presenca_sync_eventos(run_id, tipo)
  values (v_run_id, 'iniciada');
  return jsonb_build_object('adquirida', true, 'run_id', v_run_id, 'status', 'iniciada');
end;
$$;

create or replace function public.presenca_sync_heartbeat_v1(
  p_run_id uuid,
  p_contagens jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_agora timestamptz := clock_timestamp();
  v_paginas integer;
  v_aulas integer;
  v_presencas integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_run_id is null or jsonb_typeof(coalesce(p_contagens, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'heartbeat invalido';
  end if;

  select * into v_exec from public.presenca_sync_execucoes where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'run_inexistente'); end if;
  if v_exec.status <> 'iniciada' then
    return jsonb_build_object('ok', false, 'motivo', 'run_terminal', 'status', v_exec.status);
  end if;
  if not exists (
    select 1 from public.presenca_sync_cobertura
     where run_id = p_run_id and status = 'iniciada' and lease_ate > v_agora
     for update
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'lease_inativa');
  end if;

  v_paginas := coalesce((p_contagens ->> 'paginas_lidas')::integer, v_exec.paginas_lidas);
  v_aulas := coalesce((p_contagens ->> 'aulas_lidas')::integer, v_exec.aulas_lidas);
  v_presencas := coalesce((p_contagens ->> 'presencas_lidas')::integer, v_exec.presencas_lidas);
  if least(v_paginas, v_aulas, v_presencas) < 0 then
    raise exception using errcode = '22023', message = 'contagens negativas';
  end if;

  update public.presenca_sync_execucoes set
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    heartbeat_em = v_agora
  where id = p_run_id;
  update public.presenca_sync_cobertura set
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    heartbeat_em = v_agora,
    lease_ate = v_agora + make_interval(secs => v_exec.lease_segundos),
    atualizada_em = v_agora
  where run_id = p_run_id;
  insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
  values (p_run_id, 'heartbeat', jsonb_build_object(
    'paginas_lidas', v_paginas, 'aulas_lidas', v_aulas, 'presencas_lidas', v_presencas
  ));
  return jsonb_build_object(
    'ok', true, 'run_id', p_run_id,
    'paginas_lidas', v_paginas, 'aulas_lidas', v_aulas, 'presencas_lidas', v_presencas
  );
end;
$$;

create or replace function public.presenca_sync_finalizar_v1(
  p_run_id uuid,
  p_status text,
  p_snapshot_hash text default null,
  p_contagens jsonb default '{}'::jsonb,
  p_erro_codigo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_agora timestamptz := clock_timestamp();
  v_paginas integer;
  v_aulas integer;
  v_presencas integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_status not in ('concluida', 'falhou', 'abortada')
     or jsonb_typeof(coalesce(p_contagens, '{}'::jsonb)) <> 'object'
     or (p_status = 'concluida' and coalesce(p_snapshot_hash, '') !~ '^[0-9a-f]{64}$')
     or (p_status <> 'concluida' and p_snapshot_hash is not null)
     or (p_erro_codigo is not null and p_erro_codigo !~ '^[A-Z0-9_]{1,64}$') then
    raise exception using errcode = '22023', message = 'finalizacao invalida';
  end if;

  select * into v_exec from public.presenca_sync_execucoes where id = p_run_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'run_inexistente'); end if;
  if v_exec.status <> 'iniciada' then
    return jsonb_build_object(
      'ok', v_exec.status = p_status, 'motivo', 'run_terminal',
      'run_id', p_run_id, 'status', v_exec.status,
      'publicavel', v_exec.status = 'concluida' and v_exec.snapshot_hash is not null
    );
  end if;
  if not exists (
    select 1 from public.presenca_sync_cobertura
     where run_id = p_run_id and status = 'iniciada'
     for update
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'run_substituida', 'status', v_exec.status);
  end if;

  v_paginas := coalesce((p_contagens ->> 'paginas_lidas')::integer, v_exec.paginas_lidas);
  v_aulas := coalesce((p_contagens ->> 'aulas_lidas')::integer, v_exec.aulas_lidas);
  v_presencas := coalesce((p_contagens ->> 'presencas_lidas')::integer, v_exec.presencas_lidas);
  if least(v_paginas, v_aulas, v_presencas) < 0 then
    raise exception using errcode = '22023', message = 'contagens negativas';
  end if;

  update public.presenca_sync_execucoes set
    status = p_status, snapshot_hash = p_snapshot_hash,
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    erro_codigo = p_erro_codigo, heartbeat_em = v_agora, finalizada_em = v_agora
  where id = p_run_id;
  update public.presenca_sync_cobertura set
    status = p_status, lease_ate = null, heartbeat_em = v_agora,
    snapshot_hash = p_snapshot_hash,
    paginas_lidas = v_paginas, aulas_lidas = v_aulas, presencas_lidas = v_presencas,
    finalizada_em = v_agora, atualizada_em = v_agora
  where run_id = p_run_id;
  insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
  values (p_run_id, p_status, jsonb_strip_nulls(jsonb_build_object(
    'snapshot_hash', p_snapshot_hash, 'erro_codigo', p_erro_codigo,
    'paginas_lidas', v_paginas, 'aulas_lidas', v_aulas, 'presencas_lidas', v_presencas
  )));
  return jsonb_build_object(
    'ok', true, 'run_id', p_run_id, 'status', p_status,
    'publicavel', p_status = 'concluida'
  );
end;
$$;

create or replace function public.fn_presenca_dados_frescos_v1(
  p_unidade_id uuid,
  p_data_alvo date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cobertura public.presenca_sync_cobertura%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  select * into v_cobertura
    from public.presenca_sync_cobertura
   where unidade_id = p_unidade_id and modo = 'presenca' and data_alvo = p_data_alvo;
  if not found then
    return jsonb_build_object(
      'unidade_id', p_unidade_id, 'data_alvo', p_data_alvo,
      'status', 'sem_cobertura', 'publicavel', false
    );
  end if;
  return jsonb_build_object(
    'unidade_id', v_cobertura.unidade_id,
    'data_alvo', v_cobertura.data_alvo,
    'run_id', v_cobertura.run_id,
    'status', v_cobertura.status,
    'publicavel', v_cobertura.status = 'concluida' and v_cobertura.snapshot_hash is not null,
    'snapshot_hash', v_cobertura.snapshot_hash,
    'paginas_lidas', v_cobertura.paginas_lidas,
    'aulas_lidas', v_cobertura.aulas_lidas,
    'presencas_lidas', v_cobertura.presencas_lidas,
    'heartbeat_em', v_cobertura.heartbeat_em,
    'finalizada_em', v_cobertura.finalizada_em
  );
end;
$$;

revoke all on table public.presenca_sync_execucoes from public, anon, authenticated, service_role;
revoke all on table public.presenca_sync_eventos from public, anon, authenticated, service_role;
revoke all on table public.presenca_sync_cobertura from public, anon, authenticated, service_role;
grant select, insert, update on table public.presenca_sync_execucoes to service_role;
grant select, insert on table public.presenca_sync_eventos to service_role;
grant usage, select on sequence public.presenca_sync_eventos_id_seq to service_role;
grant select, insert, update on table public.presenca_sync_cobertura to service_role;

revoke all on function public.presenca_sync_iniciar_v1(uuid, text, date, uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.presenca_sync_heartbeat_v1(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.presenca_sync_finalizar_v1(uuid, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_presenca_dados_frescos_v1(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.presenca_sync_iniciar_v1(uuid, text, date, uuid, integer) to service_role;
grant execute on function public.presenca_sync_heartbeat_v1(uuid, jsonb) to service_role;
grant execute on function public.presenca_sync_finalizar_v1(uuid, text, text, jsonb, text) to service_role;
grant execute on function public.fn_presenca_dados_frescos_v1(uuid, date) to service_role;

comment on table public.presenca_sync_execucoes is
  'Uma linha por tentativa de sync; inclui tentativas deduplicadas como abortadas.';
comment on table public.presenca_sync_eventos is
  'Transicoes append-only do sync; a aplicacao nao possui UPDATE nem DELETE.';
comment on table public.presenca_sync_cobertura is
  'Estado atual por unidade, modo e data; somente concluida com hash e publicavel.';
