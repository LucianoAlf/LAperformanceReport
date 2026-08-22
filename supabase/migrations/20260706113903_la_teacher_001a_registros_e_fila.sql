-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Helper de updated_at
create or replace function public.fn_set_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

-- 1 · FILA DE ÁUDIOS
create table if not exists public.fabio_fila_audios (
  id               uuid primary key default gen_random_uuid(),
  professor_id     integer references public.professores(id),
  unidade_id       uuid references public.unidades(id),
  aula_id          integer references public.aulas_emusys(id),
  storage_path     text not null,
  duracao_segundos integer,
  status           text not null default 'pendente'
                   check (status in ('pendente','transcrevendo','transcrito','normalizado','erro')),
  transcricao      text,
  erro             text,
  tentativas       integer not null default 0,
  origem           text not null default 'app' check (origem in ('app','whatsapp')),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists ix_fabio_audios_status on public.fabio_fila_audios(status, criado_em);
create index if not exists ix_fabio_audios_prof   on public.fabio_fila_audios(professor_id);
drop trigger if exists trg_fabio_audios_upd on public.fabio_fila_audios;
create trigger trg_fabio_audios_upd before update on public.fabio_fila_audios
  for each row execute function public.fn_set_atualizado_em();

-- 2 · REGISTROS DE AULA ESTRUTURADOS
create table if not exists public.fabio_registros_aula (
  id                  uuid primary key default gen_random_uuid(),
  aula_id             integer not null references public.aulas_emusys(id),
  unidade_id          uuid not null references public.unidades(id),
  professor_id        integer references public.professores(id),
  aluno_id            integer references public.alunos(id),
  parent_id           uuid references public.fabio_registros_aula(id) on delete cascade,
  molde               text not null check (molde in ('A','B','C')),
  campos              jsonb not null default '{}'::jsonb,
  texto_consolidado   text,
  status              text not null default 'rascunho'
                      check (status in ('rascunho','aguardando_confirmacao','confirmado','gravado_emusys','descartado')),
  origem              text not null default 'app' check (origem in ('app','whatsapp')),
  audio_id            uuid references public.fabio_fila_audios(id),
  checkpoint_sugerido jsonb,
  confirmado_em       timestamptz,
  confirmado_por      integer references public.usuarios(id),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint chk_tronco_ou_fatia check (aluno_id is not null or parent_id is null)
);
create index if not exists ix_fabio_reg_aula   on public.fabio_registros_aula(aula_id);
create index if not exists ix_fabio_reg_prof   on public.fabio_registros_aula(professor_id, status);
create index if not exists ix_fabio_reg_aluno  on public.fabio_registros_aula(aluno_id);
create index if not exists ix_fabio_reg_parent on public.fabio_registros_aula(parent_id);
drop trigger if exists trg_fabio_reg_upd on public.fabio_registros_aula;
create trigger trg_fabio_reg_upd before update on public.fabio_registros_aula
  for each row execute function public.fn_set_atualizado_em();
