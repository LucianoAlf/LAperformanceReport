-- O relatorio gerencial fecha por competencia mensal. O Health Score V3
-- continua governando ranking/premiacao de ciclo, mas nao pode esconder os
-- melhores numeros do mes ja fechado. Este produtor usa somente metricas
-- mensais publicaveis e preserva cobertura por metrica.

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
    h.*,
    coalesce(p.nome, 'Nao informado')::text as professor_nome
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
    and h.metrica in ('permanencia', 'conversao', 'presenca', 'media_turma')
),
totais as (
  select
    m.metrica,
    count(distinct h.professor_id)::integer as professores_total,
    count(distinct h.professor_id) filter (
      where h.metrica_publicavel = true and h.valor_bruto is not null
    )::integer as professores_publicaveis
  from metricas m
  left join health_base h on h.metrica = m.metrica
  group by m.metrica
),
elegiveis as (
  select
    h.*,
    row_number() over (
      partition by h.metrica
      order by
        case when h.metrica = 'conversao'
          then coalesce(h.numerador, 0)
          else coalesce(h.valor_bruto, -999999999::numeric)
        end desc,
        h.valor_bruto desc nulls last,
        h.professor_nome
    ) as ordem
  from health_base h
  where h.metrica_publicavel = true
    and h.valor_bruto is not null
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
      when 'conversao' then 'conversao-experimental-v1'
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

create or replace function public.get_relatorio_gerencial_canonico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_base jsonb;
  v_rankings jsonb;
  v_mensais jsonb;
begin
  v_base := public.get_relatorio_gerencial_canonico_base_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_mensais := public.get_relatorio_gerencial_ranking_mensal_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_rankings := coalesce(v_base->'rankings', '{}'::jsonb);
  v_rankings := jsonb_set(v_rankings, '{mensais}', v_mensais, true);
  v_rankings := jsonb_set(
    v_rankings,
    '{destaques_mensais_parciais}',
    jsonb_build_object(
      'status', 'indisponivel',
      'motivo', 'fechamento_mensal_publicado'
    ),
    true
  );
  return jsonb_set(v_base, '{rankings}', v_rankings, true);
end;
$function$;

revoke all on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_gerencial_ranking_mensal_v1(uuid, integer, integer) is
  'Publica os melhores numeros do fechamento mensal por metrica, com cobertura explicita, sem promover o ciclo Health Score.';
