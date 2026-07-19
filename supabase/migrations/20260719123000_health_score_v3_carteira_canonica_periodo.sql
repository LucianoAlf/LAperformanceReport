-- Corrige a regressao do Gate 8: numero de alunos e media/turma devem usar
-- a carteira canonica ja homologada. O historico reconstruido de periodos
-- continua sendo fonte de permanencia/retencao, nunca proxy de carteira.

alter function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) rename to get_health_score_professor_v3_metricas_periodo_base_20260719;

revoke all on function public.get_health_score_professor_v3_metricas_periodo_base_20260719(
  date, uuid, text
) from public, anon, authenticated, fabio_agent, service_role;

create or replace function public.get_health_score_professor_v3_carteira_periodo(
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
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_periodo record;
  v_fim_recorte date;
  v_meses_esperados integer;
begin
  if p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODO_INVALIDO: use mensal ou ciclo';
  end if;

  select * into v_periodo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade);

  v_fim_recorte := least(
    v_periodo.periodo_fim,
    (v_competencia + interval '1 month - 1 day')::date,
    current_date
  );
  v_meses_esperados := case when p_periodicidade = 'ciclo' then 3 else 1 end;

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), meses as (
    select gs::date as mes,
      (gs + interval '1 month - 1 day')::date as mes_fim
    from generate_series(
      v_periodo.periodo_inicio::timestamp,
      date_trunc('month', v_fim_recorte)::timestamp,
      interval '1 month'
    ) gs
  ), fonte_mensal as (
    select
      m.mes,
      c.professor_id,
      c.unidade_id,
      c.carteira_alunos,
      c.alunos_via_turmas as ocupacoes,
      c.turmas_elegiveis_media as turmas,
      c.fonte_carteira
    from meses m
    cross join lateral public.get_carteira_professor_periodo_canonica(
      extract(year from m.mes)::integer,
      extract(month from m.mes)::integer,
      p_unidade_id,
      m.mes,
      m.mes_fim
    ) c
    join unidades_permitidas up on up.unidade_id = c.unidade_id
  ), alvos_unidade as (
    select distinct f.professor_id, f.unidade_id from fonte_mensal f
    union
    select distinct pu.professor_id, pu.unidade_id
    from public.professores_unidades pu
    join public.professores p on p.id = pu.professor_id and p.ativo = true
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado') not in ('ignorado', 'rejeitado')
  ), fechamentos_unidade as (
    select
      a.professor_id,
      a.unidade_id,
      m.mes,
      case
        when f.professor_id is not null then f.carteira_alunos
        when m.mes = date_trunc('month', current_date)::date then 0
        else null
      end as alunos,
      case
        when f.professor_id is not null then f.ocupacoes
        when m.mes = date_trunc('month', current_date)::date then 0
        else null
      end as ocupacoes,
      case
        when f.professor_id is not null then f.turmas
        when m.mes = date_trunc('month', current_date)::date then 0
        else null
      end as turmas,
      coalesce(
        f.fonte_carteira,
        case when m.mes = date_trunc('month', current_date)::date
          then 'carteira_atual_vazia' end
      ) as fonte_carteira
    from alvos_unidade a
    cross join meses m
    left join fonte_mensal f
      on f.professor_id = a.professor_id
     and f.unidade_id = a.unidade_id
     and f.mes = m.mes
  ), fechamentos as (
    select
      f.professor_id,
      case when p_unidade_id is null then null::uuid else f.unidade_id end
        as unidade_saida,
      f.mes,
      sum(f.alunos)::integer as alunos,
      sum(f.ocupacoes)::integer as ocupacoes,
      sum(f.turmas)::integer as turmas,
      count(*) filter (where f.alunos is not null)::integer as unidades_com_base,
      jsonb_agg(distinct f.fonte_carteira) filter (
        where f.fonte_carteira is not null
      ) as fontes
    from fechamentos_unidade f
    where f.alunos is not null
    group by f.professor_id,
      case when p_unidade_id is null then null::uuid else f.unidade_id end,
      f.mes
  ), stats as (
    select
      f.professor_id,
      f.unidade_saida,
      avg(f.alunos::numeric) as media_alunos,
      sum(f.alunos)::integer as soma_alunos,
      sum(f.ocupacoes)::integer as ocupacoes,
      sum(f.turmas)::integer as turmas,
      count(distinct f.mes)::integer as meses,
      jsonb_agg(jsonb_build_object(
        'mes', f.mes,
        'alunos_fechamento', f.alunos,
        'ocupacoes_unicas', f.ocupacoes,
        'turmas_regulares', f.turmas,
        'fontes', coalesce(f.fontes, '[]'::jsonb)
      ) order by f.mes) as fechamentos
    from fechamentos f
    group by f.professor_id, f.unidade_saida
  ), metricas as (
    select
      'media_turma'::text as metrica,
      s.professor_id,
      s.unidade_saida,
      case when s.turmas > 0
        then round(s.ocupacoes::numeric / s.turmas::numeric, 2) end as valor_bruto,
      s.ocupacoes::numeric as numerador,
      s.turmas::numeric as denominador,
      s.ocupacoes as amostra,
      case
        when s.turmas = 0 then 'sem_base'
        when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
          then 'provisorio'
        else 'ok'
      end as estado_base,
      s.turmas > 0 as publicavel,
      case
        when s.turmas = 0 then 'sem_base'
        when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
          then 'provisoria'
        else 'alta'
      end as confianca,
      case
        when s.turmas = 0 then 'nenhuma turma regular elegivel no periodo'
        when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
          then 'ciclo ainda nao possui tres fechamentos mensais'
        else null
      end as motivo_sem_base,
      s.fechamentos,
      s.meses
    from stats s

    union all

    select
      'numero_alunos'::text,
      s.professor_id,
      s.unidade_saida,
      round(s.media_alunos, 2),
      s.soma_alunos::numeric,
      s.meses::numeric,
      s.meses,
      case
        when s.meses = 0 then 'sem_base'
        when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
          then 'provisorio'
        else 'ok'
      end,
      s.meses > 0,
      case
        when s.meses = 0 then 'sem_base'
        when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
          then 'provisoria'
        else 'alta'
      end,
      case
        when s.meses = 0 then 'nenhum fechamento mensal disponivel'
        when p_periodicidade = 'ciclo' and s.meses < v_meses_esperados
          then 'ciclo ainda nao possui tres fechamentos mensais'
        else null
      end,
      s.fechamentos,
      s.meses
    from stats s
  )
  select
    m.metrica,
    m.professor_id,
    p.nome::text,
    m.unidade_saida,
    v_competencia,
    m.valor_bruto,
    m.numerador,
    m.denominador,
    m.amostra,
    m.estado_base,
    m.publicavel,
    m.confianca,
    'get_carteira_professor_periodo_canonica+professor_carteira_mensal_canonica'::text,
    'health-score-professor-v3-carteira-periodo-2'::text,
    m.motivo_sem_base,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_periodo.periodo_inicio,
      'periodo_fim', v_periodo.periodo_fim,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_periodo.ciclo_codigo,
      'fechamentos', coalesce(m.fechamentos, '[]'::jsonb),
      'meses_com_base', m.meses,
      'meses_esperados', v_meses_esperados,
      'agregacao', case when m.metrica = 'media_turma'
        then 'soma_ocupacoes_sobre_soma_turmas'
        else 'media_fechamentos_disponiveis' end,
      'apta_oficial', p_periodicidade = 'ciclo'
        and m.meses = v_meses_esperados
    )
  from metricas m
  join public.professores p on p.id = m.professor_id
  order by p.nome, m.unidade_saida, m.metrica;
end;
$$;

comment on function public.get_health_score_professor_v3_carteira_periodo(
  date, uuid, text
) is
  'Numero de alunos e media/turma V3 pela fonte canonica homologada: snapshot mensal auditado no fechado e jornada canonica no mes aberto.';

revoke all on function public.get_health_score_professor_v3_carteira_periodo(
  date, uuid, text
) from public, anon, authenticated, fabio_agent;
grant execute on function public.get_health_score_professor_v3_carteira_periodo(
  date, uuid, text
) to service_role;

create or replace function public.get_health_score_professor_v3_metricas_periodo(
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
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
  from public.get_health_score_professor_v3_metricas_periodo_base_20260719(
    p_competencia, p_unidade_id, p_periodicidade
  ) b
  where b.metrica not in ('media_turma', 'numero_alunos')

  union all

  select *
  from public.get_health_score_professor_v3_carteira_periodo(
    p_competencia, p_unidade_id, p_periodicidade
  );
$$;

comment on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) is
  'Seis metricas V3; carteira e media/turma delegam para a fonte mensal canonica homologada. Demais pilares preservam o motor periodico anterior.';

revoke all on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) from public, anon, fabio_agent;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) to authenticated, service_role;
