-- Harness do teste de "leads_com_agendamento" canônico (migration 20261002040000).
-- Stub da vw_jornada_lead_v1 sobre fixture com os 4 casos do critério:
--   só data_experimental (Emusys), só linha em lead_experimentais, ambos, nenhum.

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

create table if not exists jornada_fixture (
  lead_id uuid, nome text, telefone text, unidade_id uuid, canal_origem text,
  entrou_em date, experimental_agendada_para date, aulas_experimentais int,
  experimentais_realizadas int, converteu boolean, aluno_id uuid,
  meta_ad_source_id text, campanha_meta text, convertido_em date,
  created_at timestamptz, ultimo_contato_em timestamptz
);
truncate jornada_fixture;
insert into jornada_fixture values
  -- dentro da janela 25/09–01/10 (fim exclusivo 02/10):
  ('a0000000-0000-0000-0000-000000000001','L1','5501','11111111-1111-1111-1111-111111111111','Instagram','2026-09-25','2026-09-28',2,1,false,null,'ad-1','Camp A',null,'2026-09-25T10:00','2026-09-28T10:00'),
  ('a0000000-0000-0000-0000-000000000002','L2','5502','11111111-1111-1111-1111-111111111111','Google','2026-09-26','2026-09-29',0,0,false,null,null,null,null,'2026-09-26T10:00','2026-09-26T10:00'),
  ('a0000000-0000-0000-0000-000000000003','L3','5503','11111111-1111-1111-1111-111111111111','Google','2026-09-27',null,1,0,false,null,null,null,null,'2026-09-27T10:00','2026-09-27T10:00'),
  ('a0000000-0000-0000-0000-000000000004','L4','5504','22222222-2222-2222-2222-222222222222','Indicação','2026-09-28',null,0,0,false,null,null,null,null,'2026-09-28T10:00','2026-09-28T10:00'),
  ('a0000000-0000-0000-0000-000000000005','L5','5505','22222222-2222-2222-2222-222222222222','Indicação','2026-09-30',null,0,0,true,'b0000000-0000-0000-0000-00000000000a',null,null,'2026-10-03','2026-09-30T10:00','2026-09-30T10:00'),
  ('a0000000-0000-0000-0000-000000000006','L6','5506','33333333-3333-3333-3333-333333333333','Instagram','2026-10-01',null,0,0,false,null,null,null,null,'2026-10-01T10:00','2026-10-01T10:00'),
  -- fora da janela (entrou 24/09):
  ('a0000000-0000-0000-0000-000000000007','L7','5507','11111111-1111-1111-1111-111111111111','Instagram','2026-09-24','2026-09-25',1,0,false,null,null,null,null,'2026-09-24T10:00','2026-09-24T10:00');
-- janela: leads=6 (L1..L6); com_agendamento canônico=3 (L1,L2,L3); critério antigo daria 2.
-- realizadas=1 (L1); convertidos=1 aluno distinto (L5); indicação canal com 2 leads.

drop view if exists public.vw_jornada_lead_v1;
create view public.vw_jornada_lead_v1 as select * from jornada_fixture;
