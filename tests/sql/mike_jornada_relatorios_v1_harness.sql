-- Bootstrap mínimo para PostgreSQL descartável; não representa autorização/catalogo produtivos.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='mike_mcp') then create role mike_mcp nologin noinherit nobypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role',true),'')
$$;

create table public.unidades(id uuid primary key,nome text,codigo text unique);
insert into public.unidades values ('00000000-0000-0000-0000-000000000001','Campo Grande','CG');

create table public.vw_jornada_lead_v1(
  lead_id integer,nome text,telefone text,unidade_id uuid,unidade_nome text,canal_origem text,
  meta_ad_source_id text,campanha_meta text,entrou_em date,convertido_em date,
  aulas_experimentais bigint,experimentais_realizadas bigint,converteu boolean,
  created_at timestamptz,ultimo_contato_em timestamptz
);
insert into public.vw_jornada_lead_v1
select g,'Pessoa '||g,'2199999'||g,'00000000-0000-0000-0000-000000000001','Campo Grande',
  case when g<=8 then 'Instagram' else 'Google' end,
  case when g<=8 then 'ad-'||g end,case when g<=8 then 'Campanha A' end,
  date '2026-09-01'+g,case when g<=6 then date '2026-09-03'+g end,
  case when g<=7 then 1 else 0 end,case when g<=6 then 1 else 0 end,g<=6,
  timestamptz '2026-09-20 12:00:00+00',timestamptz '2026-09-20 12:00:00+00'
from generate_series(1,10) g;

create table public.vw_ads_gasto_diario_v1(
  dia date,plataforma text,campanha_id text,campanha_nome text,canal_tipo text,gasto numeric,
  impressoes bigint,cliques bigint,conversoes_plataforma numeric,moeda text
);
insert into public.vw_ads_gasto_diario_v1 values
  ('2026-09-10','meta','cmp-1','Campanha A',null,100,10000,500,50,'BRL'),
  ('2026-09-10','google','cmp-2','Pesquisa', 'search',80,5000,200,20,'BRL');

create table public.radar_padroes(
  codigo text,titulo text,aprendizado text,amostra_n integer,periodo_medido text,confianca text,
  metodo text,ativo boolean,medido_em timestamptz,versao text,dominio text,visibilidade text
);
create table public.radar_regras(
  codigo text,titulo text,orientacao_padrao text,ativo boolean,padrao_codigo text
);
create table public.radar_rodadas(concluida_em timestamptz);
insert into public.radar_padroes values ('P1','Gargalo antes da aula','Testar lembrete',100,'set/2026','alta','coorte',true,now(),'v1','marketing','interna');
insert into public.radar_regras values ('R1','Lembrar','Rodar teste com gate',true,'P1');
insert into public.radar_rodadas values(now());

create or replace function public.get_experimentais_professor_canonicos_v1(uuid,integer,integer,integer)
returns table(professor_id integer,professor_nome text,unidade_id uuid,unidade_nome text,
  realizadas_emusys integer,faltas_emusys integer,canceladas_emusys integer,matriculas_pos_exp integer,taxa_exp_mat numeric)
language sql stable as $$
  select 1,'Professor A','00000000-0000-0000-0000-000000000001'::uuid,'Campo Grande',10,1,0,3,30.0
  union all select 2,'Professor B','00000000-0000-0000-0000-000000000001'::uuid,'Campo Grande',2,0,0,1,50.0
$$;
