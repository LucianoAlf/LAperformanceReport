begin;

-- O painel representa ausencia corrente como 0/0. O documento deve preservar
-- os mesmos numerador, denominador e amostra, em vez de transformar os dois
-- primeiros em null durante a soma filtrada.
create or replace function public.relatorio_coordenacao_presenca_v4(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodicidade text,
  p_data_corte date
)
returns table (
  professor_id integer,
  numerador numeric,
  denominador numeric,
  valor numeric,
  amostra integer,
  motivo text,
  codigo_evidencia text,
  pendencia boolean,
  competencias_observadas integer,
  detalhes jsonb
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with periodos as materialized (
    select competencia
    from public.relatorio_coordenacao_periodos_v4(
      p_ano,
      p_mes,
      p_periodicidade,
      p_data_corte
    )
  ), metricas as materialized (
    select
      p.competencia,
      m.professor_id,
      m.valor_bruto,
      m.numerador,
      m.denominador,
      m.amostra,
      m.motivo_sem_base,
      m.codigo_evidencia,
      m.detalhes
    from periodos p
    cross join lateral public.get_health_score_professor_v3_performance_snapshot_v3(
      p.competencia,
      p_unidade_id,
      'mensal'
    ) m
    where m.metrica = 'presenca'
      and coalesce(
        nullif(m.detalhes ->> 'referencia_temporaria', '')::boolean,
        false
      ) is false
  ), agregadas as (
    select
      m.professor_id,
      coalesce(
        sum(m.numerador) filter (where m.denominador > 0),
        0::numeric
      ) as numerador,
      coalesce(
        sum(m.denominador) filter (where m.denominador > 0),
        0::numeric
      ) as denominador,
      coalesce(
        sum(coalesce(m.amostra, m.denominador::integer, 0))
          filter (where m.denominador > 0),
        0
      )::integer as amostra,
      count(*) filter (where m.denominador > 0)::integer
        as competencias_observadas,
      (array_agg(m.motivo_sem_base order by m.competencia desc)
        filter (where m.motivo_sem_base is not null))[1] as motivo,
      (array_agg(m.codigo_evidencia order by m.competencia desc)
        filter (where m.codigo_evidencia is not null))[1] as codigo_evidencia,
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'competencia', m.competencia,
          'numerador', m.numerador,
          'denominador', m.denominador,
          'valor', m.valor_bruto,
          'codigo_evidencia', m.codigo_evidencia
        ))
        order by m.competencia
      ) as competencias
    from metricas m
    group by m.professor_id
  )
  select
    a.professor_id,
    a.numerador,
    a.denominador,
    case
      when a.denominador > 0
        then round(100 * a.numerador / a.denominador, 2)
      else null::numeric
    end as valor,
    a.amostra,
    a.motivo,
    a.codigo_evidencia,
    (
      a.denominador <= 0
      and coalesce(a.codigo_evidencia, '') not in (
        'calendario_sem_aulas_elegiveis',
        'sem_eventos_elegiveis_periodo',
        'sem_aulas_elegiveis'
      )
    ) as pendencia,
    a.competencias_observadas,
    jsonb_build_object(
      'regra_agregacao', 'soma_numeradores_dividida_pela_soma_denominadores',
      'competencias', a.competencias
    ) as detalhes
  from agregadas a
  order by a.professor_id;
$function$;

revoke all on function public.relatorio_coordenacao_presenca_v4(
  uuid, integer, integer, text, date
) from public, anon, authenticated;
grant execute on function public.relatorio_coordenacao_presenca_v4(
  uuid, integer, integer, text, date
) to service_role;

comment on function public.relatorio_coordenacao_presenca_v4(
  uuid, integer, integer, text, date
) is
  'Presenca progressiva da Coordenacao espelha as fotografias mensais do painel, preservando 0/0 quando ainda nao houve evento elegivel e sem referencia de competencia anterior.';

commit;
