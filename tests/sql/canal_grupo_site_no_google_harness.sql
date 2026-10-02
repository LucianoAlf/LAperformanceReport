-- Harness descartável para validar a migration canal_grupo (Google+Site).
-- Reproduz só o que kpis_comercial_v2_sem_cache_20260923 e upsert_lead tocam.
create extension if not exists unaccent;

create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role mike_mcp nologin noinherit nobypassrls;
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;

create table public.unidades(id uuid primary key, nome text, codigo text, ativo bool default true);
insert into public.unidades values ('00000000-0000-0000-0000-0000000000aa','Recreio','REC',true);

create table public.canais_origem(id serial primary key, nome varchar, nome_normalizado varchar, ativo bool default true, created_at timestamptz default now());
insert into public.canais_origem(nome) values ('Instagram'),('Facebook'),('Google'),('Site'),('Visita/Placa'),('Indicação'),('Sem canal');

create table public.cursos(id int primary key, nome text, is_projeto_banda bool default false);
insert into public.cursos values (10,'Violão',false);

create table public.tipos_matricula(id int primary key, codigo text, conta_como_pagante bool default true);
insert into public.tipos_matricula values (1,'PRIMEIRO',true);

create table public.leads(
  id serial primary key, nome text, telefone text, email text, unidade_id uuid,
  emusys_lead_id int, nocodb_lead_id int, curso_interesse_id int, canal_origem_id int,
  data_nascimento date, etapa_pipeline_id int, status text, data_contato date,
  quantidade int default 1, converteu bool default false, aluno_id int,
  lead_origem_id int, origem_registro text, arquivado bool default false,
  arquivado_em timestamptz, gclid text, meta_ctwa_clid text,
  created_at timestamptz, updated_at timestamptz, data_ultimo_contato timestamptz
);
create unique index leads_tel_unidade_uq on public.leads(telefone, unidade_id) where telefone is not null and arquivado = false;

create table public.lead_experimentais(id serial primary key, lead_id int, aluno_id int, unidade_id uuid, data_experimental date, status text, created_at timestamptz default now());
create table public.aluno_presenca(id serial primary key, aluno_id int, unidade_id uuid, data_aula date, status text, aula_emusys_id int);
create table public.aulas_emusys(id serial primary key, categoria text, cancelada bool default false);
create table public.visitas(id serial primary key, unidade_id uuid, lead_id int, data date, status text);
create table public.alunos(id serial primary key, unidade_id uuid, nome text, valor_passaporte numeric, is_segundo_curso bool, tipo_aluno text, curso_id int, tipo_matricula_id int, data_matricula date, arquivado_em timestamptz, lead_origem_id int);
create table public.leads_automacao_log(id serial primary key, lead_nome text, lead_id int, unidade_nome text, evento text, acao text, detalhes jsonb, created_at timestamptz);

-- Fixture set/2026 (REC): 3 Google + 2 Site + 1 Instagram + 1 sem canal = 7 leads
insert into public.leads(nome, unidade_id, canal_origem_id, data_contato, status, created_at, updated_at) values
 ('L1','00000000-0000-0000-0000-0000000000aa',3,'2026-09-03','novo',now(),now()),
 ('L2','00000000-0000-0000-0000-0000000000aa',3,'2026-09-05','novo',now(),now()),
 ('L3','00000000-0000-0000-0000-0000000000aa',3,'2026-09-07','novo',now(),now()),
 ('L4','00000000-0000-0000-0000-0000000000aa',4,'2026-09-09','novo',now(),now()),
 ('L5','00000000-0000-0000-0000-0000000000aa',4,'2026-09-11','novo',now(),now()),
 ('L6','00000000-0000-0000-0000-0000000000aa',1,'2026-09-13','novo',now(),now()),
 ('L7','00000000-0000-0000-0000-0000000000aa',null,'2026-09-15','novo',now(),now());
