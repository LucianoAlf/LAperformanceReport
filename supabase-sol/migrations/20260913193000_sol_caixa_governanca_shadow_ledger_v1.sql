-- Checkpoint 2 da governança operacional do Caixa da Sol.
--
-- TELEMETRIA APENAS: este schema não referencia nem altera caixas, faturas,
-- lançamentos ou saldos. O runtime envia somente identificadores HMAC e enums.
-- Texto, nome, telefone, JID, mídia, OCR, prompt e payload financeiro são
-- proibidos pelo contrato da RPC.

create table if not exists public.sol_caixa_governanca_episodios_v1 (
  episode_id       text primary key,
  key_id           text not null,
  unit_code        text not null check (unit_code in ('campo_grande','recreio','barra','unknown')),
  source           text not null,
  message_kind     text not null,
  first_seen_at    timestamptz not null,
  last_seen_at     timestamptz not null,
  redelivery_count integer not null default 0 check (redelivery_count >= 0),
  terminal_state   text,
  created_at       timestamptz not null default now()
);

create table if not exists public.sol_caixa_governanca_eventos_v1 (
  event_key     text primary key,
  episode_id   text not null references public.sol_caixa_governanca_episodios_v1(episode_id),
  event_type   text not null,
  occurred_at  timestamptz not null,
  unit_code    text not null,
  source       text not null,
  message_kind text not null,
  key_id       text not null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists sol_caixa_governanca_eventos_episode_idx
  on public.sol_caixa_governanca_eventos_v1 (episode_id, occurred_at);
create index if not exists sol_caixa_governanca_eventos_type_idx
  on public.sol_caixa_governanca_eventos_v1 (event_type, occurred_at desc);

comment on table public.sol_caixa_governanca_episodios_v1 is
  'Índice sanitizado dos episódios observados nos grupos do Caixa. IDs são HMAC; não contém conversa nem identidade.';
comment on table public.sol_caixa_governanca_eventos_v1 is
  'Ledger append-only da rota operacional do Caixa. Telemetria; não é razão financeiro nem fonte de saldo.';

alter table public.sol_caixa_governanca_episodios_v1 enable row level security;
alter table public.sol_caixa_governanca_eventos_v1 enable row level security;
revoke all on public.sol_caixa_governanca_episodios_v1 from public, anon, authenticated;
revoke all on public.sol_caixa_governanca_eventos_v1 from public, anon, authenticated;
grant select on public.sol_caixa_governanca_episodios_v1 to service_role;
grant select on public.sol_caixa_governanca_eventos_v1 to service_role;

create or replace function public.sol_caixa_governanca_registrar_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_episode text := coalesce(p_payload->>'episode_id','');
  v_event   text := coalesce(p_payload->>'event_key','');
  v_type    text := coalesce(p_payload->>'event_type','');
  v_when    timestamptz;
  v_unit    text := coalesce(p_payload->>'unit_code','unknown');
  v_source  text := coalesce(p_payload->>'source','unknown');
  v_kind    text := coalesce(p_payload->>'message_kind','unknown');
  v_key_id  text := coalesce(p_payload->>'key_id','');
  v_details jsonb := coalesce(p_payload->'details','{}'::jsonb);
  v_row_count integer := 0;
  v_terminal text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'motivo', 'payload_invalido');
  end if;
  if (p_payload - array['schema_version','episode_id','event_key','event_type','occurred_at','unit_code','source','message_kind','key_id','details']) <> '{}'::jsonb then
    return jsonb_build_object('ok', false, 'motivo', 'campo_top_level_proibido');
  end if;
  if coalesce(p_payload->>'schema_version','') !~ '^[0-9]+$'
     or (p_payload->>'schema_version')::int <> 1 then
    return jsonb_build_object('ok', false, 'motivo', 'schema_version_invalida');
  end if;
  if v_episode !~ '^ep1\.[a-z0-9_-]{1,24}\.[0-9a-f]{64}$'
     or v_event !~ '^evt1\.[a-z0-9_-]{1,24}\.[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'motivo', 'chave_hmac_invalida');
  end if;
  if v_type not in ('message_observed','redelivery_observed','route_decided','tool_selected',
      'preview_prepared','preview_sent','approval_observed','approval_consumed',
      'write_applied','write_refused','receipt_sent','readback_confirmed',
      'readback_failed','episode_closed','correlation_gap','instrument_failure') then
    return jsonb_build_object('ok', false, 'motivo', 'event_type_invalido');
  end if;
  if v_unit not in ('campo_grande','recreio','barra','unknown')
     or v_source !~ '^[a-z0-9_-]{1,80}$'
     or v_kind !~ '^[a-z0-9_-]{1,80}$'
     or v_key_id !~ '^[a-z0-9_-]{1,24}$' then
    return jsonb_build_object('ok', false, 'motivo', 'enum_invalido');
  end if;
  begin
    v_when := (p_payload->>'occurred_at')::timestamptz;
  exception when others then
    return jsonb_build_object('ok', false, 'motivo', 'occurred_at_invalido');
  end;
  if v_when > now() + interval '5 minutes' or v_when < now() - interval '35 days' then
    return jsonb_build_object('ok', false, 'motivo', 'occurred_at_fora_da_janela');
  end if;
  if jsonb_typeof(v_details) <> 'object'
     or (v_details - array['route','engine','tool_name','action','outcome','reason_code','media_kind',
          'terminal_state','readback_status','correlation_status','duplicate','preview_ref','approval_ref',
          'movement_ref','receipt_ref','readback_ref','tool_call_ref']) <> '{}'::jsonb
     or length(v_details::text) > 3000
     or exists (select 1 from jsonb_each(v_details) e where jsonb_typeof(e.value) not in ('string','boolean')) then
    return jsonb_build_object('ok', false, 'motivo', 'details_proibidos');
  end if;

  v_terminal := nullif(v_details->>'terminal_state','');
  insert into public.sol_caixa_governanca_episodios_v1 (
    episode_id, key_id, unit_code, source, message_kind, first_seen_at, last_seen_at,
    redelivery_count, terminal_state
  ) values (
    v_episode, v_key_id, v_unit, v_source, v_kind, v_when, v_when,
    0, v_terminal
  )
  on conflict (episode_id) do update set
    last_seen_at = greatest(public.sol_caixa_governanca_episodios_v1.last_seen_at, excluded.last_seen_at),
    terminal_state = coalesce(excluded.terminal_state, public.sol_caixa_governanca_episodios_v1.terminal_state);

  insert into public.sol_caixa_governanca_eventos_v1 (
    event_key, episode_id, event_type, occurred_at, unit_code, source, message_kind, key_id, details
  ) values (v_event, v_episode, v_type, v_when, v_unit, v_source, v_kind, v_key_id, v_details)
  on conflict (event_key) do nothing;
  get diagnostics v_row_count = row_count;

  if v_row_count = 1 and v_type = 'redelivery_observed' then
    update public.sol_caixa_governanca_episodios_v1
       set redelivery_count = redelivery_count + 1
     where episode_id = v_episode;
  end if;

  return jsonb_build_object('ok', true, 'inserted', v_row_count = 1, 'episode_id', v_episode, 'event_key', v_event);
end;
$$;

revoke all on function public.sol_caixa_governanca_registrar_v1(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_governanca_registrar_v1(jsonb) to service_role;

create or replace function public.sol_caixa_governanca_podar_v1(p_dias integer default 35)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_eventos integer := 0;
  v_episodios integer := 0;
begin
  if p_dias < 7 or p_dias > 90 then
    return jsonb_build_object('ok', false, 'motivo', 'retencao_fora_do_limite_7_90');
  end if;
  delete from public.sol_caixa_governanca_eventos_v1 where occurred_at < now() - make_interval(days => p_dias);
  get diagnostics v_eventos = row_count;
  delete from public.sol_caixa_governanca_episodios_v1 e
   where e.last_seen_at < now() - make_interval(days => p_dias)
     and not exists (select 1 from public.sol_caixa_governanca_eventos_v1 x where x.episode_id = e.episode_id);
  get diagnostics v_episodios = row_count;
  return jsonb_build_object('ok', true, 'retention_days', p_dias, 'eventos_removidos', v_eventos, 'episodios_removidos', v_episodios);
end;
$$;

revoke all on function public.sol_caixa_governanca_podar_v1(integer) from public, anon, authenticated;
grant execute on function public.sol_caixa_governanca_podar_v1(integer) to service_role;
