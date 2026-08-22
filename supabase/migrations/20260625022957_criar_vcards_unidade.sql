-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create table public.vcards_unidade (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  titulo      text not null,
  full_name   text not null,
  telefones   text[] not null default '{}',
  organizacao text,
  email       text,
  url         text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_vcards_unidade_unidade on public.vcards_unidade(unidade_id) where ativo;

create trigger trg_vcards_unidade_updated_at
  before update on public.vcards_unidade
  for each row execute function public.set_updated_at();

alter table public.vcards_unidade enable row level security;

create policy "vcards_unidade_select" on public.vcards_unidade
  for select using (is_admin() or (unidade_id = get_user_unidade_id()));

create policy "vcards_unidade_insert" on public.vcards_unidade
  for insert with check (is_admin() or (unidade_id = get_user_unidade_id()));

create policy "vcards_unidade_update" on public.vcards_unidade
  for update using (is_admin() or (unidade_id = get_user_unidade_id()));

create policy "vcards_unidade_delete" on public.vcards_unidade
  for delete using (is_admin() or (unidade_id = get_user_unidade_id()));
