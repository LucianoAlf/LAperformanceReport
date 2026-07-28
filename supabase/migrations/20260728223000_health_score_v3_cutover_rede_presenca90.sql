begin;

-- Preserva integralmente a regua anterior para rollback e cria uma camada
-- versionada que altera somente a cobertura minima da presenca.
alter function public.get_health_score_prof_v3_metricas_base_20260728(
  date,
  uuid,
  text
) rename to get_health_score_prof_v3_metricas_base_20260728_c95;

create or replace function public.get_health_score_prof_v3_metricas_base_20260728(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text,
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  competencia date,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  amostra integer,
  estado_base text,
  publicavel boolean,
  confianca text,
  fonte text,
  regra_versao text,
  motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_cobertura_minima constant numeric := 0.90;
begin
  return query
  with base as (
    select b.*
    from public.get_health_score_prof_v3_metricas_base_20260728_c95(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) b
  ),
  normalizada as (
    select
      b.*,
      coalesce(
        (b.detalhes ->> 'eventos_esperados_confiaveis')::integer,
        0
      ) as esperados_confiaveis,
      coalesce(
        (b.detalhes ->> 'eventos_classificados_confiaveis')::integer,
        b.amostra,
        0
      ) as classificados_confiaveis,
      coalesce(
        (b.detalhes ->> 'eventos_esperados_auditoria')::integer,
        0
      ) as esperados_auditoria
    from base b
  ),
  avaliada as (
    select
      n.*,
      case
        when n.esperados_confiaveis > 0 then
          n.classificados_confiaveis::numeric
            / n.esperados_confiaveis::numeric
        else null::numeric
      end as cobertura_fracao
    from normalizada n
  )
  select
    a.metrica,
    a.professor_id,
    a.professor_nome,
    a.unidade_id,
    a.competencia,
    a.valor_bruto,
    a.numerador,
    a.denominador,
    a.amostra,
    case
      when a.metrica <> 'presenca' then a.estado_base
      when a.esperados_confiaveis = 0
        and a.esperados_auditoria > 0 then 'em_auditoria'
      when a.esperados_confiaveis = 0 then 'sem_base'
      when a.classificados_confiaveis < 10 then 'sem_base_amostra'
      when a.cobertura_fracao < v_cobertura_minima
        then 'sem_base_cobertura'
      else 'ok'
    end::text as estado_base,
    case
      when a.metrica <> 'presenca' then a.publicavel
      else a.classificados_confiaveis >= 10
        and a.esperados_confiaveis > 0
        and a.cobertura_fracao >= v_cobertura_minima
    end as publicavel,
    case
      when a.metrica <> 'presenca' then a.confianca
      when a.esperados_confiaveis = 0
        and a.esperados_auditoria > 0 then 'auditoria'
      when a.esperados_confiaveis = 0 then 'sem_base'
      when a.classificados_confiaveis < 10
        or a.cobertura_fracao < v_cobertura_minima then 'baixa'
      else 'alta'
    end::text as confianca,
    a.fonte,
    case
      when a.metrica = 'presenca'
        then 'health-score-professor-v3-presenca-cobertura-90-1'
      else a.regra_versao
    end::text as regra_versao,
    case
      when a.metrica <> 'presenca' then a.motivo_sem_base
      when a.esperados_confiaveis = 0
        and a.esperados_auditoria > 0
        then 'Campo Grande permanece em auditoria e fora do Health Score'
      when a.esperados_confiaveis = 0
        then 'nenhum evento confiavel no periodo'
      when a.classificados_confiaveis < 10
        then 'base minima de 10 eventos nao atingida'
      when a.cobertura_fracao < v_cobertura_minima
        then 'cobertura semantica inferior a 90% do roster esperado'
      else null::text
    end as motivo_sem_base,
    case
      when a.metrica <> 'presenca' then a.detalhes
      else coalesce(a.detalhes, '{}'::jsonb) || jsonb_build_object(
        'cobertura_minima_percentual', 90,
        'regra_cobertura',
          'health-score-professor-v3-presenca-cobertura-90-1',
        'apta_oficial',
          p_periodicidade = 'ciclo'
          and coalesce(
            (a.detalhes ->> 'periodo_fim')::date,
            date '9999-12-31'
          ) <= current_date
          and a.classificados_confiaveis >= 10
          and a.esperados_confiaveis > 0
          and a.cobertura_fracao >= v_cobertura_minima
      )
    end as detalhes
  from avaliada a;
end;
$$;

revoke all on function
  public.get_health_score_prof_v3_metricas_base_20260728(
    date,
    uuid,
    text
  )
  from public, anon, authenticated;
grant execute on function
  public.get_health_score_prof_v3_metricas_base_20260728(
    date,
    uuid,
    text
  )
  to service_role;

comment on function
  public.get_health_score_prof_v3_metricas_base_20260728(
    date,
    uuid,
    text
  ) is
  'Camada V3 que preserva as metricas vigentes e versiona cobertura minima da presenca em 90%; a regua c95 permanece disponivel apenas para rollback.';

-- Operacao padrao de producao: uma unica chamada cria as revisoes das tres
-- unidades ativas e do consolidado. O materializador por unidade continua
-- disponivel somente para reparo localizado.
create or replace function public.materializar_health_score_professor_v3_rede(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception
      'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao de rede interna'
      using errcode = '42501';
  end if;

  v_resultado := public.materializar_health_score_professor_v3_periodo(
    p_competencia,
    p_periodicidade,
    null::uuid,
    p_professor_id
  );

  return v_resultado || jsonb_build_object(
    'escopo_materializacao', 'rede',
    'inclui_consolidado', true,
    'materializador_regra_versao',
      'health-score-professor-v3-materializacao-rede-1'
  );
end;
$$;

revoke all on function
  public.materializar_health_score_professor_v3_rede(date, text, integer)
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_rede(date, text, integer)
  to service_role;

comment on function
  public.materializar_health_score_professor_v3_rede(date, text, integer) is
  'Orquestrador service-only: rematerializa todas as unidades ativas e o consolidado na mesma execucao.';

commit;
