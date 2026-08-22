-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CHAT DO FABIO — DUAL CHANNEL (app + whatsapp), mesma conversa.
-- Arquitetura espelhada do que ja roda em producao no LA Organizer (Tom):
-- group_chat_messages, com channel='app'/'whatsapp', wa_message_id dedup, e Hermes fazendo
-- polling (nao trigger) num indice parcial. 213 msgs app + 574 whatsapp la, provado.
--
-- Adaptado pra 1:1 (professor <-> Fabio), nao grupo.
create table if not exists public.fabio_chat_mensagens (
  id                    uuid primary key default gen_random_uuid(),
  professor_id          integer not null references public.professores(id),
  role                  text not null check (role in ('professor','fabio')),
  kind                  text not null default 'text' check (kind in ('text','image','audio','pdf','report')),
  content               text,
  media_url             text,
  media_mime            text,
  media_filename        text,
  media_extracted_text  text,
  channel               text not null default 'app' check (channel in ('app','whatsapp')),
  wa_message_id         text,                      -- id da mensagem no WhatsApp, p/ dedup do webhook
  fabio_seen_at         timestamptz,                -- Hermes marca quando processou (polling, nao trigger)
  fabio_done_at         timestamptz,
  criado_em             timestamptz not null default now()
);

-- dedup: o webhook da UAZAPI pode reentregar a mesma mensagem. Sem isso, duplica.
create unique index if not exists fcm_wa_msg_uq
  on public.fabio_chat_mensagens (wa_message_id) where wa_message_id is not null;

-- o Hermes faz POLLING aqui (mesmo padrao do Tom) — nao ha trigger/webhook interno
create index if not exists fcm_unseen_idx
  on public.fabio_chat_mensagens (criado_em)
  where role = 'professor' and fabio_seen_at is null;

create index if not exists fcm_professor_criado_idx
  on public.fabio_chat_mensagens (professor_id, criado_em desc);

alter table public.fabio_chat_mensagens enable row level security;

-- professor le e escreve SO a propria conversa (mesmo padrao gcm_member_select/insert)
create policy fcm_professor_select on public.fabio_chat_mensagens
  for select using (professor_id = public.fn_professor_do_usuario());

create policy fcm_professor_insert on public.fabio_chat_mensagens
  for insert with check (
    professor_id = public.fn_professor_do_usuario()
    and role = 'professor'
    and channel = 'app'
    and kind in ('text','image','audio')
  );

-- Hermes (service_role) escreve as respostas do Fabio e as mensagens vindas do whatsapp
create policy fcm_service_all on public.fabio_chat_mensagens
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

revoke all on public.fabio_chat_mensagens from public, anon;
grant select, insert on public.fabio_chat_mensagens to authenticated;
grant all on public.fabio_chat_mensagens to service_role;

-- REALTIME: sem isso a tela nao atualiza sozinha quando o Fabio responde
alter publication supabase_realtime add table public.fabio_chat_mensagens;

comment on table public.fabio_chat_mensagens is
  'Chat 1:1 professor<->Fabio, dual channel (app+whatsapp), mesma conversa. Espelha o padrao ja provado em producao no LA Organizer (Tom / group_chat_messages). App insere direto (RLS); Hermes (service_role) faz polling em fabio_seen_at IS NULL e escreve as respostas.';
