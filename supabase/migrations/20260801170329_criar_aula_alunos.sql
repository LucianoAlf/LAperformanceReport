-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create table if not exists public.aula_alunos (
  id               bigserial primary key,
  aula_emusys_id   integer not null references public.aulas_emusys(id) on delete cascade,
  unidade_id       uuid not null references public.unidades(id),
  aluno_id         integer references public.alunos(id) on delete set null,
  emusys_aluno_id  integer,
  lead_id          integer,
  nome             text not null,
  telefone         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint aula_alunos_aula_nome_key unique (aula_emusys_id, nome)
);

comment on table public.aula_alunos is
  'Vinculo aula<->aluno da grade (inclusive futura). Populado pelos syncs a partir do alunos[] '
  'que o GET /aulas do Emusys ja devolve. NAO e fonte de presenca: presenca vive em aluno_presenca.';
comment on column public.aula_alunos.nome is
  'Snapshot do nome_aluno vindo da API. Nao acompanha renomeacao em alunos; use aluno_id para join.';
comment on column public.aula_alunos.aluno_id is
  'Null quando o participante ainda e lead (aula experimental).';
comment on column public.aula_alunos.emusys_aluno_id is
  'id_aluno da API do Emusys. Casa com alunos.emusys_student_id (NAO existe alunos.emusys_aluno_id).';

create index if not exists idx_aula_alunos_aula on public.aula_alunos(aula_emusys_id);
create index if not exists idx_aula_alunos_aluno on public.aula_alunos(aluno_id);
create index if not exists idx_aula_alunos_unidade on public.aula_alunos(unidade_id);

alter table public.aula_alunos enable row level security;

create policy aula_alunos_select_policy on public.aula_alunos
  for select using (is_admin() or unidade_id in (select get_user_unidade_ids()));

create policy aula_alunos_insert_policy on public.aula_alunos
  for insert with check (is_admin() or unidade_id in (select get_user_unidade_ids()));

create policy aula_alunos_update_policy on public.aula_alunos
  for update using (is_admin() or unidade_id in (select get_user_unidade_ids()));

create policy aula_alunos_delete_policy on public.aula_alunos
  for delete using (is_admin() or unidade_id in (select get_user_unidade_ids()));
