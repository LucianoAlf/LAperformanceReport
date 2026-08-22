-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

alter table public.fabio_chat_mensagens
  add column if not exists identidade_tipo text not null default 'professor';

alter table public.fabio_chat_mensagens
  add column if not exists usuario_id integer references public.usuarios(id);

alter table public.fabio_chat_mensagens
  alter column professor_id drop not null;

alter table public.fabio_chat_mensagens
  drop constraint if exists fabio_chat_mensagens_identidade_tipo_check;

alter table public.fabio_chat_mensagens
  add constraint fabio_chat_mensagens_identidade_tipo_check
  check (identidade_tipo in ('professor','admin'));

alter table public.fabio_chat_mensagens
  drop constraint if exists fabio_chat_mensagens_actor_check;

alter table public.fabio_chat_mensagens
  add constraint fabio_chat_mensagens_actor_check
  check (
    (identidade_tipo = 'professor' and professor_id is not null)
    or
    (identidade_tipo = 'admin' and usuario_id is not null)
  );

create index if not exists idx_fabio_chat_mensagens_admin_history
  on public.fabio_chat_mensagens (identidade_tipo, usuario_id, criado_em desc)
  where identidade_tipo = 'admin';

create index if not exists idx_fabio_chat_mensagens_prof_history
  on public.fabio_chat_mensagens (identidade_tipo, professor_id, criado_em desc)
  where identidade_tipo = 'professor';
