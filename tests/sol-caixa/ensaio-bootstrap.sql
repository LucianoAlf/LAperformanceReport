-- Bootstrap do banco isolado: papéis, extensões e stubs que o Supabase provê
-- e um Postgres nu não tem.
--
-- ⚠️ RODA UMA VEZ, EM CONTAINER NOVO. O replay das migrations NÃO é idempotente
--    — a `20260817193125_financeiro_faturas_tipo_canonico_set_based.sql` RENOMEIA
--    a implementação grande e CRIA o wrapper fino; na segunda passada ela falha
--    com "function already exists" e o nome canônico fica com a implementação
--    ANTIGA, sem o enriquecimento de tipo. Foi exatamente o que aconteceu comigo
--    (rodei o replay duas vezes) e me levou a concluir, errado, que faltavam
--    migrations no repositório. Não faltavam: o bootstrap é que estava sujo.
--
-- ⚠️ ORDEM OBRIGATÓRIA: bootstrap → schema base → replay ÚNICO → seed.
--    As tabelas base precisam existir ANTES das migrations, senão elas falham em
--    cascata e a "segunda passada para consertar" é o que quebra tudo.

-- Papéis e extensões que o Supabase provê e um Postgres nu não tem.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login password 'ensaio';
create role supabase_admin superuser login password 'ensaio';
create role sol_acesso_restrito nologin;
create role sol_caixa_readonly nologin;
grant anon, authenticated, service_role to authenticator;

create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Stubs do que o Supabase injeta. O ensaio não autentica ninguém.
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;
create schema if not exists graphql_public;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);

-- pg_cron / pg_net: as migrations agendam jobs. Aqui viram no-op.
create schema if not exists cron;
create schema if not exists net;
create or replace function cron.schedule(text, text, text) returns bigint language sql as $$ select 0::bigint $$;
create or replace function cron.unschedule(text) returns boolean language sql as $$ select true $$;
create or replace function cron.alter_job(bigint, schedule text default null) returns void language sql as $$ select $$;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 0::bigint $$;

alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
