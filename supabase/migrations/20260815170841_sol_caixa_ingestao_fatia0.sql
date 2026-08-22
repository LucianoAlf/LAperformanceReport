-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create table if not exists public.sol_caixa_ingestao_recebimentos (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  message_id text not null,
  unidade_id uuid,
  status text not null default 'recebido'
    check (status in ('recebido','extraido','preview_enviado','lancado','ignorado','erro')),
  motivo_ignorado text,
  valor_extraido numeric,
  forma_extraida text,
  categoria_extraida text,
  aluno_extraido text,
  raw_text text,
  media_ref text,
  preview_json jsonb,
  preview_message_id text,
  idempotency_key text not null,
  fingerprint text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (chat_id, message_id),
  unique (idempotency_key)
);
alter table public.sol_caixa_ingestao_recebimentos enable row level security;
revoke all on public.sol_caixa_ingestao_recebimentos from anon, authenticated;

create or replace function public.sol_caixa_ingestao_registrar(p_payload jsonb)
returns table(id uuid, inserido boolean)
language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare v_id uuid; v_ins boolean := false;
begin
  insert into public.sol_caixa_ingestao_recebimentos
    (chat_id, message_id, unidade_id, status, motivo_ignorado, valor_extraido,
     forma_extraida, categoria_extraida, aluno_extraido, raw_text, media_ref,
     idempotency_key, fingerprint)
  values (
    p_payload->>'chat_id', p_payload->>'message_id',
    nullif(p_payload->>'unidade_id','')::uuid,
    coalesce(p_payload->>'status','recebido'), p_payload->>'motivo_ignorado',
    nullif(p_payload->>'valor_extraido','')::numeric,
    p_payload->>'forma_extraida', p_payload->>'categoria_extraida',
    p_payload->>'aluno_extraido', left(coalesce(p_payload->>'raw_text',''),4000),
    p_payload->>'media_ref', p_payload->>'idempotency_key', p_payload->>'fingerprint')
  on conflict (idempotency_key) do nothing
  returning sol_caixa_ingestao_recebimentos.id into v_id;
  if v_id is not null then v_ins := true;
  else select r.id into v_id from public.sol_caixa_ingestao_recebimentos r
       where r.idempotency_key = p_payload->>'idempotency_key'; end if;
  return query select v_id, v_ins;
end $fn$;

revoke all on function public.sol_caixa_ingestao_registrar(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_ingestao_registrar(jsonb) to service_role;
