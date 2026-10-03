-- Harness de mike_funil_semana_v1: schema mínimo + stubs determinísticos das 3 fontes
-- canônicas que a função consome. O objetivo é testar A FUNÇÃO (loop, fim exclusivo,
-- merges, gate, shape) — a aditividade real das fontes é evidência medida em produção.
--
-- Convenção do repo: roles guardadas em pg_roles para reuso do mesmo cluster.

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

-- Fixture diária: valores por dia para o grão 'diario' das fontes stubadas.
-- Escolhidos para somar totais de mês conhecidos e para exercitar merges
-- (dois canais com canais_originais sobrepostos, curso duplicado entre dias).
create table if not exists harness_dias (
  dia date primary key,
  leads int, agendadas int, realizadas int, presenca int, faltas int,
  canceladas int, visitas int, sem_presenca int, mat_sem_lead int,
  denominador int, conversoes int, pendencias int
);
truncate harness_dias;
insert into harness_dias values
  ('2026-09-01', 10, 5, 4, 3, 1, 1, 1, 1, 0, 4, 2, 0),
  ('2026-09-02', 20, 8, 6, 5, 2, 2, 1, 1, 1, 6, 3, 0),
  ('2026-09-03', 15, 7, 5, 4, 1, 0, 2, 0, 0, 5, 2, 1),
  ('2026-09-04', 30,10, 9, 7, 3, 3, 2, 2, 0, 8, 4, 0),
  ('2026-09-05', 25, 9, 8, 6, 2, 1, 1, 1, 0, 7, 3, 0);
-- totais do período 01–05: leads=100, agendadas=39, realizadas=32, presenca=25,
-- faltas=9, canceladas=7, visitas=7, sem_presenca=5, mat_sem_lead=1,
-- denominador=30, conversoes=14, pendencias=1.
-- semana A = 01–02 (leads 30, agendadas 13, realizadas 10, presenca 8, faltas 3,
--   canceladas 3, visitas 2, sem_presenca 2, mat_sem_lead 1, denom 10, conv 5, pend 0)
-- semana B = 03–05 (leads 70, agendadas 26, realizadas 22, presenca 17, faltas 6,
--   canceladas 4, visitas 5, sem_presenca 3, mat_sem_lead 0, denom 20, conv 9, pend 1)

create table if not exists harness_canais (dia date, canal text, leads int, conv int, mat int, originais text[]);
truncate harness_canais;
insert into harness_canais values
  ('2026-09-01', 'Instagram', 8, 1, 0, array['Instagram']),
  ('2026-09-01', 'Google',    2, 0, 0, array['Google']),
  ('2026-09-02', 'Instagram',15, 2, 1, array['Instagram']),
  ('2026-09-02', 'Google',    5, 1, 0, array['Google','Site']),
  ('2026-09-03', 'Google',    9, 0, 0, array['Site']),
  ('2026-09-04', 'Instagram',20, 3, 0, array['Instagram']),
  ('2026-09-04', 'Sem canal',10, 0, 0, array['Sem canal']),
  ('2026-09-05', 'Instagram',25, 4, 1, array['Instagram']);
-- período: Instagram=68/conv10/mat2, Google=16/conv1/mat0 originais=[Google,Site], Sem canal=10

create table if not exists harness_cursos (dia date, curso text, leads int, mat int);
truncate harness_cursos;
insert into harness_cursos values
  ('2026-09-01', 'Bateria', 4, 0), ('2026-09-01', 'Sem curso', 6, 0),
  ('2026-09-02', 'Bateria', 9, 1), ('2026-09-02', 'Canto', 11, 0),
  ('2026-09-03', 'Canto', 15, 0),
  ('2026-09-04', 'Bateria', 12, 0), ('2026-09-04', 'Sem curso', 18, 0),
  ('2026-09-05', 'Sem curso', 25, 1);
-- período: Sem curso=49/mat1, Bateria=25/mat1, Canto=26/mat0

create table if not exists harness_matriculas (
  de date, ate date, matriculas int, total_parcelas numeric,
  total_passaportes numeric, qtd_passaportes int
);
truncate harness_matriculas;
insert into harness_matriculas values
  ('2026-09-01', '2026-10-01', 60, 25579, 26577, 60),
  ('2026-09-01', '2026-09-06',  7,  2940,  3100,  7),
  ('2026-09-01', '2026-09-03',  3,  1260,  1320,  3),
  ('2026-09-03', '2026-09-06',  4,  1680,  1780,  4);

create or replace function public.kpis_comercial_v2_sem_cache_20260923(
  p_unidade_id uuid, p_ano int, p_mes int, p_periodo text, p_data date
) returns jsonb language plpgsql stable as $$
declare d harness_dias%rowtype;
begin
  select * into d from harness_dias where dia = p_data;
  if not found then
    return jsonb_build_object('ok', true, 'kpis', '{}'::jsonb, 'origem_canal', '[]'::jsonb, 'cursos_mais_procurados', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'kpis', jsonb_build_object(
      'leads_entrantes', d.leads,
      'experimentais_agendadas_periodo', d.agendadas,
      'experimentais_realizadas_status_operacional', d.realizadas,
      'experimentais_realizadas_presenca_confirmada', d.presenca,
      'experimentais_no_show', d.faltas,
      'experimentais_canceladas', d.canceladas,
      'visitas', d.visitas,
      'experimentais_realizadas_status_operacional_sem_presenca', d.sem_presenca,
      'matriculas_sem_lead_vinculado', d.mat_sem_lead),
    'origem_canal', coalesce((
      select jsonb_agg(jsonb_build_object('canal', c.canal, 'leads', c.leads,
        'leads_convertidos_operacional', c.conv,
        'matriculas_comerciais_principais', c.mat,
        'canais_originais', to_jsonb(c.originais)))
      from harness_canais c where c.dia = p_data), '[]'::jsonb),
    'cursos_mais_procurados', coalesce((
      select jsonb_agg(jsonb_build_object('curso', c.curso, 'leads', c.leads,
        'matriculas_comerciais_principais', c.mat))
      from harness_cursos c where c.dia = p_data), '[]'::jsonb));
end $$;

create or replace function public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid, p_ano int, p_mes int, p_periodo text, p_data date
) returns jsonb language plpgsql stable as $$
declare d harness_dias%rowtype;
begin
  select * into d from harness_dias where dia = p_data;
  if not found then return jsonb_build_object('resumo', '{}'::jsonb); end if;
  return jsonb_build_object('resumo', jsonb_build_object(
    'denominador_taxa_exp_mat', d.denominador,
    'conversoes_exp_mat_canonicas', d.conversoes,
    'pendencias_taxa_exp_mat', d.pendencias));
end $$;

create or replace function public.get_matriculas_comerciais_resumo_v1(
  p_unidade_id uuid, p_de date, p_ate date, p_criado_ate timestamptz
) returns jsonb language plpgsql stable as $$
declare m harness_matriculas%rowtype;
begin
  select * into m from harness_matriculas where de = p_de and ate = p_ate;
  if not found then m.matriculas := 0; m.total_parcelas := 0; m.total_passaportes := 0; m.qtd_passaportes := 0; end if;
  return jsonb_build_object(
    'matriculas', coalesce(m.matriculas, 0),
    'total_parcelas', coalesce(m.total_parcelas, 0),
    'total_passaportes', coalesce(m.total_passaportes, 0),
    'qtd_passaportes', coalesce(m.qtd_passaportes, 0),
    'ticket_medio_parcela', round(m.total_parcelas / nullif(m.matriculas, 0), 2),
    'ticket_medio_passaporte', round(m.total_passaportes / nullif(m.qtd_passaportes, 0), 2),
    'lista', jsonb_build_array(jsonb_build_object('nome','PESSOA FIXTURE','telefone','5599999')));
end $$;
