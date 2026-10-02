-- Harness do teste de cobertura de click-ids (migration 20261002050000).
-- Mesma fixture do harness de agendamento + colunas gclid/meta_ctwa_clid.
-- ATENÇÃO: este harness provê a view SEM as flags — as flags vêm da migration sob teste
-- (a migration recria a view com create or replace). Para o stub funcionar, a view
-- precisa existir sobre uma tabela que já tenha as colunas gclid/meta_ctwa_clid.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'mike_mcp') then create role mike_mcp nologin noinherit nobypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role' $$;

create table if not exists public.unidades (id uuid primary key, codigo text, nome text);
truncate public.unidades;
insert into public.unidades values
  ('11111111-1111-1111-1111-111111111111', 'CG', 'Campo Grande'),
  ('22222222-2222-2222-2222-222222222222', 'REC', 'Recreio'),
  ('33333333-3333-3333-3333-333333333333', 'BARRA', 'Barra da Tijuca');

-- mínimos que a view referencia (joins auxiliares + função de telefone)
create table if not exists public.canais_origem (id int primary key, nome text);
create table if not exists public.cursos (id uuid primary key, nome text);
create table if not exists public.professores (id uuid primary key, nome text);
create table if not exists public.meta_ads_cache (source_id text primary key, ad_name text, campaign_name text);
create table if not exists public.leads_campanhas (lead_id uuid, created_at timestamptz, campanha_nome text);
create table if not exists public.instagram_sessoes (telefone_chave text, iniciada_em timestamptz, ultima_atividade_em timestamptz, transferido boolean, conta text, estagio text, interesse text);
create table if not exists public.lead_experimentais (lead_id uuid, data_experimental date, status text);
create or replace function public.fn_normalizar_telefone_br_key(t text) returns text language sql immutable as $$ select regexp_replace(coalesce(t,''),'\D','','g') $$;

-- leads mínimos com as colunas que a view lê (l_1.*)
create table if not exists public.leads (
  id uuid primary key, nome text, telefone text, unidade_id uuid, canal_origem_id int,
  curso_interesse_id uuid, professor_experimental_id uuid, meta_ad_source_id text,
  data_contato date, created_at timestamptz, data_primeiro_contato timestamptz,
  data_ultimo_contato timestamptz, data_experimental date, data_passagem_mila timestamptz,
  data_conversao date, data_arquivamento timestamptz, converteu boolean, aluno_id uuid,
  status text, experimental_realizada boolean, faltou_experimental boolean,
  experimental_agendada boolean, motivo_nao_matricula text, temperatura text,
  agente_comercial text, gclid text, meta_ctwa_clid text
);
truncate public.leads;
insert into public.leads
  (id, nome, telefone, unidade_id, data_contato, created_at, data_experimental,
   converteu, aluno_id, data_conversao, status, gclid, meta_ctwa_clid)
values
  -- janela 25/09–01/10 (fim exclusivo 02/10):
  ('a0000000-0000-0000-0000-000000000001','L1','5511','11111111-1111-1111-1111-111111111111','2026-09-25','2026-09-25T10:00','2026-09-28',false,null,null,'novo','GCLID-SEGREDO-001',null),
  ('a0000000-0000-0000-0000-000000000002','L2','5522','11111111-1111-1111-1111-111111111111','2026-09-26','2026-09-26T10:00','2026-09-29',false,null,null,'novo',null,'CTWA-SEGREDO-002'),
  ('a0000000-0000-0000-0000-000000000003','L3','5533','11111111-1111-1111-1111-111111111111','2026-09-27','2026-09-27T10:00',null,false,null,null,'novo','GCLID-SEGREDO-003','CTWA-SEGREDO-003'),
  ('a0000000-0000-0000-0000-000000000004','L4','5544','22222222-2222-2222-2222-222222222222','2026-09-28','2026-09-28T10:00',null,false,null,null,'novo',null,null),
  ('a0000000-0000-0000-0000-000000000005','L5','5555','22222222-2222-2222-2222-222222222222','2026-09-30','2026-09-30T10:00',null,true,'b0000000-0000-0000-0000-00000000000a','2026-10-03','novo',null,null),
  ('a0000000-0000-0000-0000-000000000006','L6','5566','33333333-3333-3333-3333-333333333333','2026-10-01','2026-10-01T10:00',null,false,null,null,'novo',null,null),
  ('a0000000-0000-0000-0000-000000000007','L7','5577','11111111-1111-1111-1111-111111111111','2026-09-24','2026-09-24T10:00',null,false,null,null,'novo','GCLID-FORA-JANELA',null);
-- janela: 6 leads; gclid: L1+L3=2; ctwa: L2+L3=2; algum: L1,L2,L3=3 (L7 fora)

-- a janela usa entrou_em = coalesce(data_contato, d_criado) — data_contato preenchida.
-- L3 tem linha de experimental (cancelada): evidência de agendamento pelo lado da linha.
truncate public.lead_experimentais;
insert into public.lead_experimentais values
  ('a0000000-0000-0000-0000-000000000001', '2026-09-28', 'experimental_agendada'),
  ('a0000000-0000-0000-0000-000000000003', '2026-09-27', 'cancelada');

-- canais para por_canal:
truncate public.canais_origem;
insert into public.canais_origem values (1,'Instagram'),(3,'Google'),(5,'Indicação');
update public.leads set canal_origem_id = 1 where nome in ('L1','L6','L7');
update public.leads set canal_origem_id = 3 where nome in ('L2','L3');
update public.leads set canal_origem_id = 5 where nome in ('L4','L5');
