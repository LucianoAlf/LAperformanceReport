-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create table if not exists public.sol_caixa_shadow_eventos_v1 (
  id uuid primary key default gen_random_uuid(),
  event_id_hash text not null unique,
  chat_id_hash text not null,
  sender_id_hash text,
  unidade_id uuid references public.unidades(id),
  observed_at timestamptz,
  source text not null default 'sol_whatsapp_group_observe',
  mode text not null default 'shadow_inline_private',
  status text not null default 'observed',
  raw_ref jsonb not null default '{}'::jsonb,
  resolver_json jsonb not null default '{}'::jsonb,
  warnings text[] not null default '{}'::text[],
  blocks text[] not null default '{}'::text[],
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.sol_caixa_shadow_previews_v1 (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.sol_caixa_shadow_eventos_v1(id) on delete cascade,
  preview_hash text not null,
  unidade_id uuid references public.unidades(id),
  operacao text,
  categoria text,
  valor_centavos integer,
  forma text,
  status text not null default 'shadow_private',
  preview_json jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique (evento_id, preview_hash)
);

create table if not exists public.sol_caixa_shadow_approvals_v1 (
  id uuid primary key default gen_random_uuid(),
  preview_id uuid not null references public.sol_caixa_shadow_previews_v1(id) on delete cascade,
  approval_event_hash text not null,
  actor_id_hash text,
  decision text not null,
  decision_json jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique (preview_id, approval_event_hash)
);

alter table public.sol_caixa_shadow_eventos_v1 enable row level security;
alter table public.sol_caixa_shadow_previews_v1 enable row level security;
alter table public.sol_caixa_shadow_approvals_v1 enable row level security;

create index if not exists idx_sol_caixa_shadow_eventos_unidade_criado on public.sol_caixa_shadow_eventos_v1 (unidade_id, criado_em desc);
create index if not exists idx_sol_caixa_shadow_eventos_status on public.sol_caixa_shadow_eventos_v1 (status, criado_em desc);
create index if not exists idx_sol_caixa_shadow_previews_status on public.sol_caixa_shadow_previews_v1 (status, criado_em desc);

revoke all on public.sol_caixa_shadow_eventos_v1 from anon, authenticated, public;
revoke all on public.sol_caixa_shadow_previews_v1 from anon, authenticated, public;
revoke all on public.sol_caixa_shadow_approvals_v1 from anon, authenticated, public;

create or replace function public.sol_caixa_shadow_registrar(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_event_id uuid;
  v_preview_id uuid;
  v_event_hash text := nullif(p_payload->>'event_id_hash', '');
  v_preview_hash text := nullif(p_payload->>'preview_hash', '');
begin
  if v_event_hash is null then
    raise exception 'event_id_hash obrigatório';
  end if;

  insert into public.sol_caixa_shadow_eventos_v1 (
    event_id_hash, chat_id_hash, sender_id_hash, unidade_id, observed_at,
    source, mode, status, raw_ref, resolver_json, warnings, blocks
  ) values (
    v_event_hash,
    coalesce(nullif(p_payload->>'chat_id_hash', ''), 'unknown'),
    nullif(p_payload->>'sender_id_hash', ''),
    nullif(p_payload->>'unidade_id', '')::uuid,
    nullif(p_payload->>'observed_at', '')::timestamptz,
    coalesce(nullif(p_payload->>'source', ''), 'sol_whatsapp_group_observe'),
    coalesce(nullif(p_payload->>'mode', ''), 'shadow_inline_private'),
    coalesce(nullif(p_payload->>'status', ''), 'observed'),
    coalesce(p_payload->'raw_ref', '{}'::jsonb),
    coalesce(p_payload->'resolver_json', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'warnings', '[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'blocks', '[]'::jsonb))), '{}'::text[])
  )
  on conflict (event_id_hash) do update set
    status = excluded.status,
    resolver_json = excluded.resolver_json,
    warnings = excluded.warnings,
    blocks = excluded.blocks,
    atualizado_em = now()
  returning id into v_event_id;

  if v_preview_hash is not null then
    insert into public.sol_caixa_shadow_previews_v1 (
      evento_id, preview_hash, unidade_id, operacao, categoria, valor_centavos,
      forma, status, preview_json
    ) values (
      v_event_id,
      v_preview_hash,
      nullif(p_payload->>'unidade_id', '')::uuid,
      p_payload->>'operacao',
      p_payload->>'categoria',
      nullif(p_payload->>'valor_centavos', '')::integer,
      p_payload->>'forma',
      coalesce(nullif(p_payload->>'preview_status', ''), 'shadow_private'),
      coalesce(p_payload->'preview_json', '{}'::jsonb)
    )
    on conflict (evento_id, preview_hash) do update set
      status = excluded.status,
      preview_json = excluded.preview_json
    returning id into v_preview_id;
  end if;

  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'preview_id', v_preview_id);
end;
$$;

revoke all on function public.sol_caixa_shadow_registrar(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_shadow_registrar(jsonb) to service_role;
grant execute on function public.sol_caixa_shadow_registrar(jsonb) to sol_acesso_restrito;
comment on table public.sol_caixa_shadow_eventos_v1 is 'Sol Caixa V3 shadow privado: eventos reais observados sem resposta pública e sem mutação financeira.';
comment on table public.sol_caixa_shadow_previews_v1 is 'Sol Caixa V3 shadow privado: previews calculados para auditoria, nunca enviados ao WhatsApp por esta tabela.';
comment on table public.sol_caixa_shadow_approvals_v1 is 'Sol Caixa V3 shadow privado: decisões de aprovação observadas, sem acionar write financeiro.';
comment on function public.sol_caixa_shadow_registrar(jsonb) is 'Registra evento/preview shadow V3 idempotente. Não toca caixa_movimentacoes e não lança financeiro.';
