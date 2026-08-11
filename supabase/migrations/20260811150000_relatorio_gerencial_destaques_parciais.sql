-- Publica evidencias mensais de professores quando o ciclo ainda nao e oficial.
-- O ranking oficial continua sendo servido somente pelo snapshot fechado; esta
-- camada acrescenta destaques parciais sem ordinalidade competitiva.

alter function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  rename to get_relatorio_gerencial_canonico_base_v1;

create or replace function public.get_relatorio_gerencial_destaques_parciais_v1(
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
  select make_date(p_ano, p_mes, 1) as competencia
),
health_base as materialized (
  select
    h.*,
    coalesce(p.nome, 'Não informado')::text as professor_nome
  from parametros prm
  cross join lateral public.get_health_score_professor_v3_performance(
    prm.competencia,
    p_unidade_id,
    'mensal'
  ) h
  left join public.professores p on p.id = h.professor_id
  where h.estado_publicacao = 'parcial'
    and coalesce(h.score_exibivel, false) = true
    and h.metrica in ('permanencia', 'conversao', 'presenca', 'media_turma')
),
totais as (
  select
    metrica,
    count(*)::integer as professores_total,
    count(*) filter (
      where metrica_publicavel = true and valor_bruto is not null
    )::integer as professores_publicaveis
  from health_base
  group by metrica
),
elegiveis as (
  select
    h.*,
    row_number() over (
      partition by h.metrica
      order by h.valor_bruto desc, h.professor_nome
    ) as ordem
  from health_base h
  where h.metrica_publicavel = true
    and h.valor_bruto is not null
),
blocos as (
  select
    case e.metrica
      when 'permanencia' then 'retencao'
      when 'conversao' then 'matriculadores'
      else e.metrica
    end as chave,
    jsonb_build_object(
      'status', 'parcial',
      'cobertura', format(
        '%s de %s professores',
        t.professores_publicaveis,
        t.professores_total
      ),
      'regra', case e.metrica
        when 'permanencia' then 'permanencia-media-v1'
        when 'conversao' then 'conversao-experimental-v1'
        when 'presenca' then 'presenca-media-v1'
        when 'media_turma' then 'media-alunos-turma-v1'
        else 'metrica-professor-v1'
      end,
      'itens', jsonb_agg(
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
      ) filter (where e.ordem <= 3)
    ) as bloco
  from elegiveis e
  join totais t on t.metrica = e.metrica
  group by e.metrica, t.professores_publicaveis, t.professores_total
)
select coalesce(
  jsonb_object_agg(chave, bloco),
  '{}'::jsonb
)
from blocos;
$function$;

revoke all on function public.get_relatorio_gerencial_destaques_parciais_v1(uuid, integer, integer)
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
  v_destaques jsonb;
begin
  v_base := public.get_relatorio_gerencial_canonico_base_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_destaques := public.get_relatorio_gerencial_destaques_parciais_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  return jsonb_set(
    v_base,
    '{rankings,destaques_mensais_parciais}',
    coalesce(v_destaques, '{}'::jsonb),
    true
  );
end;
$function$;

revoke all on function public.get_relatorio_gerencial_canonico_base_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_gerencial_canonico_v1(uuid, integer, integer) is
  'Compoe o relatorio gerencial a partir dos fechamentos mensais e acrescenta destaques parciais publicaveis sem criar ranking oficial.';
