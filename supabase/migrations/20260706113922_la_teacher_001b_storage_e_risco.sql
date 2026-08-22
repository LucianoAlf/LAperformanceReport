-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 3 · STORAGE — bucket privado de áudios
insert into storage.buckets (id, name, public)
values ('fabio-audios','fabio-audios', false)
on conflict (id) do nothing;

drop policy if exists "fabio_audios_insert_own" on storage.objects;
create policy "fabio_audios_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fabio-audios'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fabio_audios_select_own" on storage.objects;
create policy "fabio_audios_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'fabio-audios'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- 4 · RISCO DE EVASÃO (append-only)
create table if not exists public.risco_evasao (
  id            bigint generated always as identity primary key,
  aluno_id      integer not null references public.alunos(id),
  unidade_id    uuid references public.unidades(id),
  probabilidade numeric(5,4) not null check (probabilidade >= 0 and probabilidade <= 1),
  faixa         text not null check (faixa in ('baixo','atencao','critico')),
  fatores       jsonb,
  modelo_versao text not null default 'rf-v1',
  calculado_em  date not null default current_date,
  criado_em     timestamptz not null default now(),
  unique (aluno_id, calculado_em, modelo_versao)
);
create index if not exists ix_risco_data  on public.risco_evasao (calculado_em desc);
create index if not exists ix_risco_faixa on public.risco_evasao (faixa, calculado_em desc);

create or replace view public.vw_risco_atual as
  select distinct on (aluno_id) *
  from public.risco_evasao
  order by aluno_id, calculado_em desc, id desc;

-- Role dedicada do job de ML (H3 do Hugo)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'ml_jobs') then
    create role ml_jobs nologin;
  end if;
end $$;
grant usage on schema public to ml_jobs;
grant select on public.alunos, public.aluno_presenca, public.vw_risco_atual to ml_jobs;
grant insert on public.risco_evasao to ml_jobs;
