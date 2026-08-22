-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Sol/Hermes: fila propria para envio de anamnese ao professor.
-- A Edge notificar-anamnese enfileira; o worker no LAHQ envia pelo Hermes.

create table if not exists public.fila_anamnese_sol_hermes (
  id bigserial primary key,
  anamnese_id integer not null references public.anamneses(id) on delete cascade,
  professor_id integer not null references public.professores(id),
  professor_nome text not null,
  telefone_whatsapp text not null,
  jid text not null check (jid ~ '^[0-9]+@s\.whatsapp\.net$'),
  mensagem text not null,
  status text not null default 'sol_pendente'
    check (status in ('sol_pendente', 'sol_enviando', 'enviada', 'erro', 'falhou')),
  agendada_para timestamptz not null default now(),
  enviada_em timestamptz,
  erro text,
  message_id text,
  tentativas integer not null default 0,
  ultima_tentativa_em timestamptz,
  notificacao_log_id integer references public.notificacao_log(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_fila_anamnese_sol_hermes_open
  on public.fila_anamnese_sol_hermes (anamnese_id, professor_id)
  where status in ('sol_pendente', 'sol_enviando', 'enviada');

create index if not exists idx_fila_anamnese_sol_hermes_status_due
  on public.fila_anamnese_sol_hermes (status, agendada_para, created_at);

create index if not exists idx_fila_anamnese_sol_hermes_log
  on public.fila_anamnese_sol_hermes (notificacao_log_id);

alter table public.fila_anamnese_sol_hermes enable row level security;

grant select, insert, update on public.fila_anamnese_sol_hermes to service_role;
grant usage, select on sequence public.fila_anamnese_sol_hermes_id_seq to service_role;

comment on table public.fila_anamnese_sol_hermes is
  'Outbox Sol/Hermes para anamnese_professor. Substitui envio direto WAHA legado.';
