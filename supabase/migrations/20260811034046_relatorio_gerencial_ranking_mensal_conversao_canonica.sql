-- O ranking de matriculadores do fechamento mensal usa a fonte comercial
-- canonica do proprio mes. A conversao do Health Score V3 continua sendo
-- diagnostica por ciclo e nao deve ser reutilizada como julho.

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
with parametros as (
  select
    make_date(p_ano, p_mes, 1) as inicio,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date as fim
),
metricas (metrica, chave) as (
  values
    ('permanencia', 'retencao'),
    ('conversao', 'matriculadores'),
    ('presenca', 'presenca'),
    ('media_turma', 'media_turma')
),
health_base as materialized (
  select
    h.professor_id,
    coalesce(p.nome, 'Nao informado')::text as professor_nome,
    h.metrica,
    h.valor_bruto,
    h.numerador,
    h.denominador,
    h.amostra,
    h.confianca,
    h.metrica_publicavel
  from parametros prm
  cross join lateral public.get_health_score_professor_v3_performance(
    prm.inicio,
    p_unidade_id,
    'mensal'
  ) h
  left join public.professores p on p.id = h.professor_id
  where h.periodicidade = 'mensal'
    and h.periodo_inicio = prm.inicio
    and h.periodo_fim = prm.fim
    and h.estado_publicacao in ('parcial', 'oficial')
    and coalesce(h.score_exibivel, false) = true
    and h.metrica in ('permanencia', 'presenca', 'media_turma')
),
kpis_base as materialized (
  select
    k.professor_id,
    k.professor_nome,
    k.experimentais,
    k.matriculas_pos_exp,
    k.taxa_conversao
  from parametros prm
  cross join lateral public.get_kpis_professor_periodo_canonico_v3(
    p_ano,
    p_mes,
    p_unidade_id,
    prm.inicio,
    prm.fim
  ) k
),
metric_rows as (
  select h.*
  from health_base h
  union all
  select
    k.professor_id,
    k.professor_nome,
    'conversao'::text as metrica,
    coalesce(k.taxa_conversao, 0)::numeric as valor_bruto,
    coalesce(k.matriculas_pos_exp, 0)::numeric as numerador,
    coalesce(k.experimentais, 0)::numeric as denominador,
    coalesce(k.experimentais, 0)::integer as amostra,
    case
      when coalesce(k.experimentais, 0) >= 3
       and coalesce(k.matriculas_pos_exp, 0) > 0 then 'alta'
      else 'sem_base'
    end::text as confianca,
    (
      coalesce(k.experimentais, 0) >= 3
      and coalesce(k.matriculas_pos_exp, 0) > 0
    ) as metrica_publicavel
  from kpis_base k
),
totais as (
  select
    m.metrica,
    count(distinct r.professor_id)::integer as professores_total,
    count(distinct r.professor_id) filter (
      where r.metrica_publicavel = true and r.valor_bruto is not null
    )::integer as professores_publicaveis
  from metricas m
  left join metric_rows r on r.metrica = m.metrica
  group by m.metrica
),
elegiveis as (
  select
    r.*,
    row_number() over (
      partition by r.metrica
      order by
        case when r.metrica = 'conversao'
          then coalesce(r.numerador, 0)
          else coalesce(r.valor_bruto, -999999999::numeric)
        end desc,
        r.valor_bruto desc nulls last,
        r.professor_nome
    ) as ordem
  from metric_rows r
  where r.metrica_publicavel = true
    and r.valor_bruto is not null
),
itens as (
  select
    e.metrica,
    jsonb_agg(
      jsonb_build_object(
        'professor', e.professor_nome,
        'amostra', e.amostra,
        'numerador', e.numerador,
        'denominador', e.denominador,
        'confianca', e.confianca
      ) || case e.metrica
        when 'permanencia' then jsonb_build_object(
          'tempo_medio_permanencia', round(e.valor_bruto, 1)
        )
        when 'conversao' then jsonb_build_object(
          'matriculas', coalesce(e.numerador, 0),
          'experimentais', coalesce(e.denominador, 0),
          'taxa_conversao', round(e.valor_bruto, 2)
        )
        when 'presenca' then jsonb_build_object(
          'presenca_media', round(e.valor_bruto, 1)
        )
        when 'media_turma' then jsonb_build_object(
          'media_alunos_turma', round(e.valor_bruto, 2),
          'alunos_via_turmas', e.numerador,
          'turmas_elegiveis', e.denominador
        )
        else '{}'::jsonb
      end
      order by e.ordem
    ) filter (where e.ordem <= 3) as itens
  from elegiveis e
  group by e.metrica
)
select jsonb_object_agg(
  m.chave,
  jsonb_strip_nulls(jsonb_build_object(
    'status', 'oficial',
    'tipo', 'fechamento_mensal',
    'competencia', to_char(prm.inicio, 'YYYY-MM'),
    'cobertura', format(
      '%s de %s professores',
      coalesce(t.professores_publicaveis, 0),
      coalesce(t.professores_total, 0)
    ),
    'regra', case m.metrica
      when 'permanencia' then 'permanencia-media-v1'
      when 'conversao' then 'conversao-experimental-mensal-v1'
      when 'presenca' then 'presenca-media-v1'
      when 'media_turma' then 'media-alunos-turma-v1'
      else 'metrica-professor-v1'
    end,
    'itens', coalesce(i.itens, '[]'::jsonb),
    'motivo', case
      when coalesce(t.professores_publicaveis, 0) = 0
        then 'nenhuma_amostra_publicavel'
      else null
    end
  ))
)
from metricas m
cross join parametros prm
left join totais t on t.metrica = m.metrica
left join itens i on i.metrica = m.metrica;
$function$;

revoke all on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer) is
  'Ranking mensal: usa a fonte comercial canonica do mes para matriculadores e metricas mensais publicaveis para os demais indicadores.';
