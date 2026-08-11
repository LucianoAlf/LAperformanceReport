-- Mantem a conversao mensal no mesmo universo de professores publicado pelas
-- metricas pedagogicas da unidade. A fonte comercial pode conter professores
-- historicos/fora da grade vigente; eles nao entram no denominador do relatorio.

alter function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer)
  rename to get_relatorio_gerencial_ranking_mensal_base_20260811034046;

create or replace function public.get_relatorio_gerencial_ranking_mensal_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
with parametros as (
  select
    make_date(p_ano, p_mes, 1) as inicio,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date as fim
),
professores_base as materialized (
  select distinct h.professor_id
  from parametros prm
  cross join lateral public.get_health_score_professor_v3_performance(
    prm.inicio,
    p_unidade_id,
    'mensal'
  ) h
  where h.periodicidade = 'mensal'
    and h.periodo_inicio = prm.inicio
    and h.periodo_fim = prm.fim
    and h.metrica in ('permanencia', 'presenca', 'media_turma')
),
kpis_base as materialized (
  select
    k.professor_id,
    k.professor_nome,
    coalesce(k.experimentais, 0)::integer as experimentais,
    coalesce(k.matriculas_pos_exp, 0)::integer as matriculas,
    coalesce(k.taxa_conversao, 0)::numeric as taxa_conversao
  from parametros prm
  cross join lateral public.get_kpis_professor_periodo_canonico_v3(
    p_ano,
    p_mes,
    p_unidade_id,
    prm.inicio,
    prm.fim
  ) k
  join professores_base on professores_base.professor_id = k.professor_id
),
elegiveis as (
  select k.*
  from kpis_base k
  where k.experimentais >= 3
    and k.matriculas > 0
),
resumo as (
  select
    count(*)::integer as professores_total,
    count(*) filter (
      where k.experimentais >= 3 and k.matriculas > 0
    )::integer as professores_publicaveis
  from kpis_base k
),
itens as (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'professor', e.professor_nome,
      'amostra', e.experimentais,
      'numerador', e.matriculas,
      'denominador', e.experimentais,
      'confianca', 'alta',
      'matriculas', e.matriculas,
      'experimentais', e.experimentais,
      'taxa_conversao', round(e.taxa_conversao, 2)
    ) order by e.matriculas desc, e.taxa_conversao desc, e.professor_nome
  ) filter (where e.ordem <= 3), '[]'::jsonb) as payload
  from (
    select e.*, row_number() over (
      order by e.matriculas desc, e.taxa_conversao desc, e.professor_nome
    ) as ordem
    from elegiveis e
  ) e
),
bloco as (
  select jsonb_strip_nulls(jsonb_build_object(
    'status', 'oficial',
    'tipo', 'fechamento_mensal',
    'competencia', to_char(prm.inicio, 'YYYY-MM'),
    'cobertura', format(
      '%s de %s professores',
      coalesce(r.professores_publicaveis, 0),
      coalesce(r.professores_total, 0)
    ),
    'regra', 'conversao-experimental-mensal-v1',
    'itens', i.payload,
    'motivo', case when coalesce(r.professores_publicaveis, 0) = 0
      then 'nenhuma_amostra_publicavel' else null end
  )) as payload
  from parametros prm
  cross join resumo r
  cross join itens i
)
select jsonb_set(
  public.get_relatorio_gerencial_ranking_mensal_base_20260811034046(
    p_unidade_id, p_ano, p_mes
  ),
  '{matriculadores}',
  bloco.payload,
  true
)
from bloco;
$function$;

create or replace function public.get_relatorio_gerencial_ranking_mensal_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $function$
  select public.get_relatorio_gerencial_ranking_mensal_v2(
    p_unidade_id, p_ano, p_mes
  );
$function$;

revoke all on function public.get_relatorio_gerencial_ranking_mensal_base_20260811034046(uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_relatorio_gerencial_ranking_mensal_v2(uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.get_relatorio_gerencial_ranking_mensal_v2(uuid, integer, integer) is
  'Restringe matriculadores ao universo mensal de professores da unidade e preserva cobertura honesta.';
