-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create table if not exists public.anamnese_convites (
  id              bigserial primary key,
  token           text        not null unique,
  aluno_id        integer     references public.alunos(id) on delete set null,
  nome_aluno      text        not null,
  telefone_aluno  text,
  data_nascimento date,
  unidade_id      uuid        not null references public.unidades(id),
  tipo_formulario varchar(4)  not null check (tipo_formulario in ('EMLA', 'LAMK')),
  expira_em       timestamptz not null,
  usado_em        timestamptz,
  anamnese_id     integer     references public.anamneses(id) on delete set null,
  revogado_em     timestamptz,
  criado_por      integer,
  criado_em       timestamptz not null default now()
);

comment on table public.anamnese_convites is
  'Convites de anamnese remota. Um convite vivo por aluno; expira em 7 dias ou no uso.';

-- Um convite vivo por aluno matriculado.
create unique index if not exists anamnese_convites_aluno_vivo
  on public.anamnese_convites (aluno_id)
  where aluno_id is not null and usado_em is null and revogado_em is null;

-- Um convite vivo por nome + unidade, para pre-matricula (sem aluno_id).
create unique index if not exists anamnese_convites_prematricula_vivo
  on public.anamnese_convites (lower(nome_aluno), unidade_id)
  where aluno_id is null and usado_em is null and revogado_em is null;

alter table public.anamnese_convites enable row level security;

-- Mesmo molde da policy de anamneses: usuario ve a propria unidade, admin ve tudo.
-- O acesso publico (sem login) NAO passa por aqui: passa pelas RPCs SECURITY DEFINER.
drop policy if exists anamnese_convites_por_unidade on public.anamnese_convites;
create policy anamnese_convites_por_unidade on public.anamnese_convites
  for all
  using (
    unidade_id in (select u.unidade_id from usuarios u where u.auth_user_id = auth.uid())
    or exists (select 1 from usuarios u where u.auth_user_id = auth.uid() and u.perfil = 'admin')
  );
