-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create table if not exists public.sol_caixa_abertura_pendente (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null,
  chat_id text not null,
  data_caixa date not null,
  tipo text not null check (tipo in ('abrir','fechar')),
  status text not null default 'aguardando' check (status in ('aguardando','confirmado','expirado','cancelado')),
  preview_message_id text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por text,
  unique (unidade_id, data_caixa, tipo)
);
alter table public.sol_caixa_abertura_pendente enable row level security;
revoke all on public.sol_caixa_abertura_pendente from anon, authenticated;

-- cron cria a pendência ao postar o preview (idempotente por unidade/dia/tipo)
create or replace function public.sol_caixa_pendencia_criar(p_payload jsonb)
returns uuid language plpgsql security definer set search_path to 'pg_catalog','public' as $fn$
declare v_id uuid;
begin
  insert into public.sol_caixa_abertura_pendente (unidade_id, chat_id, data_caixa, tipo, preview_message_id, status)
  values (nullif(p_payload->>'unidade_id','')::uuid, p_payload->>'chat_id',
          coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date),
          p_payload->>'tipo', p_payload->>'preview_message_id', 'aguardando')
  on conflict (unidade_id, data_caixa, tipo)
    do update set status='aguardando', preview_message_id=excluded.preview_message_id,
                  chat_id=excluded.chat_id, criado_em=now(), resolvido_em=null, resolvido_por=null
  returning id into v_id;
  return v_id;
end $fn$;
revoke all on function public.sol_caixa_pendencia_criar(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_pendencia_criar(jsonb) to service_role;

-- bridge consulta se há abertura/fechamento aguardando pra este chat (pra rotear o "pode")
create or replace function public.sol_caixa_pendencia_aguardando(p_chat_id text)
returns jsonb language sql stable security definer set search_path to 'pg_catalog','public' as $fn$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'tipo', p.tipo, 'unidade_id', p.unidade_id,
    'data', to_char(p.data_caixa,'YYYY-MM-DD'), 'preview_message_id', p.preview_message_id) end
  from (select * from public.sol_caixa_abertura_pendente
        where chat_id = p_chat_id and status='aguardando'
          and data_caixa = (now() at time zone 'America/Sao_Paulo')::date
        order by criado_em desc limit 1) p;
$fn$;
revoke all on function public.sol_caixa_pendencia_aguardando(text) from public, anon, authenticated;
grant execute on function public.sol_caixa_pendencia_aguardando(text) to service_role;

-- resolve a pendência (após abrir/fechar)
create or replace function public.sol_caixa_pendencia_resolver(p_id uuid, p_status text, p_por text)
returns void language sql security definer set search_path to 'pg_catalog','public' as $fn$
  update public.sol_caixa_abertura_pendente
  set status = p_status, resolvido_em = now(), resolvido_por = p_por
  where id = p_id;
$fn$;
revoke all on function public.sol_caixa_pendencia_resolver(uuid,text,text) from public, anon, authenticated;
grant execute on function public.sol_caixa_pendencia_resolver(uuid,text,text) to service_role;
