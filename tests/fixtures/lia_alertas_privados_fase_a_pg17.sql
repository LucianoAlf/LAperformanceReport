\set ON_ERROR_STOP on

do $guard$
declare
  v_database text := current_database();
  v_sentinel text := current_setting('pesquisa_evasao.fixture_sentinel', true);
begin
  if v_database !~ '^pesquisa_evasao_fixture_[0-9a-f]{16}$' then
    raise exception 'FIXTURE_GUARD_DATABASE: %', v_database;
  end if;
  if v_sentinel is null or not exists (
    select 1
    from fixture_safety.sentinel
    where secret = v_sentinel
      and database_name = v_database
  ) then
    raise exception 'FIXTURE_GUARD_SENTINEL';
  end if;
end;
$guard$;

drop schema public cascade;
create schema public;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role fabio_agent nologin;
create role lia_acesso_restrito nologin;
create role mila_acesso_restrito nologin;
create role sol_acesso_restrito nologin;
create role maria_lareport_rpc nologin;
create role ml_jobs nologin;

create schema auth;
create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '');
$$;

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create schema cron;
create table cron.job (
  jobid bigserial primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null
);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text)
returns bigint language plpgsql as $$
declare v_jobid bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (p_name, p_schedule, p_command)
  on conflict (jobname) do update
    set schedule = excluded.schedule,
        command = excluded.command
  returning jobid into v_jobid;
  return v_jobid;
end;
$$;

create table public.usuarios (
  id integer primary key,
  nome text not null,
  ativo boolean not null default true,
  auth_user_id uuid
);

create table public.unidades (
  id uuid primary key,
  nome text not null
);

create table public.pesquisa_evasao (
  id uuid primary key,
  unidade_id uuid not null references public.unidades(id),
  aluno_nome text not null,
  modo_teste boolean not null default false,
  executado_por_usuario_id integer references public.usuarios(id)
);

create table public.pesquisa_evasao_analises (
  id uuid primary key,
  pesquisa_id uuid not null references public.pesquisa_evasao(id),
  versao integer not null,
  status text not null,
  unique (pesquisa_id, versao)
);

create table public.pesquisa_evasao_mensagens (
  id uuid primary key,
  pesquisa_id uuid references public.pesquisa_evasao(id),
  direcao text not null,
  tipo text not null,
  resolution_status text not null,
  substantividade text not null,
  analise_versao integer,
  provider_created_at timestamptz,
  recebido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create or replace function public.fixture_assert(p_ok boolean, p_message text)
returns void language plpgsql as $fixture$
begin
  if not p_ok then
    raise exception 'FIXTURE_ASSERT: %', p_message;
  end if;
end;
$fixture$;

-- A migration ainda será aplicada e os cenários serão preenchidos nas Tasks 2-4.
-- has_table_privilege authenticated
-- has_table_privilege service_role
-- uma rodada nao pode gerar dois alertas
-- nao pode haver notificacao cruzada
-- teste comum nao pode entrar na outbox produtiva

select 'LIA_ALERTAS_PRIVADOS_FASE_A_PG17_OK';
