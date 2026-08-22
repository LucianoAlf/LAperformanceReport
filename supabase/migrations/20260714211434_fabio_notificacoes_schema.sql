-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- FASE 2 do roadmap Chat do Fabio: notificacoes proativas.
-- Padrao comprovado: notifications do Tom (LA Organizer) — 2.169 mensagens reais entregues.
-- Sem pg_cron (confirmado que o Tom tambem nao usa) — o disparo e decidido pelo Hermes (VPS).
create table if not exists public.fabio_notificacoes (
  id               uuid primary key default gen_random_uuid(),
  professor_id     integer not null references public.professores(id),
  tipo             text not null check (tipo in (
                     'briefing_matinal','pendencia_registro','experimental_nova','reagendamento','outro')),
  categoria        text not null check (categoria in ('governanca','informativa')),
  titulo           text,
  corpo            text not null,
  referencia_tipo  text,
  referencia_id    text,
  canal            text not null check (canal in ('app','whatsapp')),
  status           text not null default 'pendente' check (status in ('pendente','enviada','falhou','pulada_preferencia')),
  motivo_pulada    text,
  enviada_em       timestamptz,
  criado_em        timestamptz not null default now(),
  -- coluna gerada (imutavel por construcao) so pra permitir indice de dedup diario
  dia_referencia   date generated always as ((criado_em at time zone 'America/Sao_Paulo')::date) stored
);

comment on table public.fabio_notificacoes is
  'Notificacoes proativas do Fabio (Fase 2). O AGENDAMENTO nao mora aqui — decidido pelo Hermes/VPS via cron, sem pg_cron (mesmo padrao do Tom). tipo=pendencia_registro/reagendamento sao SEMPRE categoria=governanca. Os demais sao informativa.';

create index if not exists idx_fabio_notif_professor_data
  on public.fabio_notificacoes (professor_id, criado_em desc);

create unique index if not exists uq_fabio_notif_briefing_diario
  on public.fabio_notificacoes (professor_id, dia_referencia)
  where tipo = 'briefing_matinal';

alter table public.fabio_notificacoes enable row level security;

create policy fn_professor_select on public.fabio_notificacoes
  for select using (professor_id = public.fn_professor_do_usuario());

create policy fn_service_all on public.fabio_notificacoes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

revoke all on public.fabio_notificacoes from public, anon;
grant select on public.fabio_notificacoes to authenticated;
grant all on public.fabio_notificacoes to service_role;
