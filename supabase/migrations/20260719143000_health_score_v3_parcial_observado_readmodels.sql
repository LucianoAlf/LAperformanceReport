-- Health Score Professor V3 - leitura parcial observada.
--
-- O snapshot oficial e seus gates permanecem imutaveis. Para acompanhamento
-- operacional, valores brutos reais podem compor um score parcial mesmo quando
-- a metrica ainda nao atingiu amostra/cobertura para ranking ou premiacao.

create or replace view public.vw_health_score_professor_v3_parcial_observado
with (security_invoker = true)
as
with metricas_base as (
  select
    s.id as snapshot_id,
    s.professor_id,
    s.unidade_id,
    s.escopo,
    s.competencia,
    s.trimestre_inicio,
    s.periodicidade,
    s.periodo_inicio,
    s.periodo_fim,
    s.ciclo_codigo,
    s.estado_publicacao,
    s.score_exibivel as score_exibivel_oficial,
    s.ranking_habilitado as ranking_habilitado_oficial,
    s.config_versao,
    s.revisao,
    s.score as score_oficial,
    s.cobertura as cobertura_oficial,
    s.classificacao as classificacao_oficial,
    s.estado,
    s.publicavel as snapshot_publicavel,
    s.publicado,
    s.motivo_bloqueio as motivo_bloqueio_oficial,
    s.regra_versao as regra_versao_snapshot_oficial,
    c.faixa_atencao_min,
    c.faixa_saudavel_min,
    m.metrica,
    m.valor_bruto,
    m.numerador,
    m.denominador,
    m.nota as nota_oficial,
    m.peso,
    m.peso_disponivel as peso_disponivel_oficial,
    m.contribuicao as contribuicao_oficial,
    m.meta_aplicada,
    m.amostra,
    m.estado_base,
    m.publicavel as metrica_publicavel_oficial,
    m.confianca,
    m.fonte,
    m.regra_versao as regra_versao_metrica_oficial,
    m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb) as detalhes_oficiais,
    case
      when s.estado_publicacao = 'oficial' then m.nota
      when m.valor_bruto is not null
       and m.meta_aplicada > 0
       and not (
         m.metrica = 'presenca'
         and coalesce(m.detalhes->>'observacao_publicacao', '') = 'em_auditoria'
       )
      then round(least(
        100::numeric,
        greatest(0::numeric, m.valor_bruto / m.meta_aplicada * 100)
      ), 2)
      else null::numeric
    end as nota_parcial_observada
  from public.health_score_professor_v3_snapshots s
  join public.health_score_professor_v3_config_versoes c
    on c.id = s.config_id
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
), metricas_calculadas as (
  select
    b.*,
    case
      when b.estado_publicacao = 'oficial' then b.peso_disponivel_oficial
      else b.nota_parcial_observada is not null
    end as peso_disponivel_parcial_observado,
    case
      when b.estado_publicacao = 'oficial' then b.contribuicao_oficial
      when b.nota_parcial_observada is not null
        then round(b.nota_parcial_observada * b.peso / 100, 4)
      else null::numeric
    end as contribuicao_parcial_observada
  from metricas_base b
), snapshots_calculados as (
  select
    m.snapshot_id,
    case
      when max(m.estado_publicacao) = 'oficial' then max(m.score_oficial)
      when sum(m.peso) filter (where m.peso_disponivel_parcial_observado) > 0
        then round(
          sum(m.contribuicao_parcial_observada)
            filter (where m.peso_disponivel_parcial_observado)
          * 100
          / sum(m.peso) filter (where m.peso_disponivel_parcial_observado),
          2
        )
      else null::numeric
    end as score_parcial_observado,
    case
      when max(m.estado_publicacao) = 'oficial' then max(m.cobertura_oficial)
      else coalesce(
        sum(m.peso) filter (where m.peso_disponivel_parcial_observado),
        0::numeric
      )
    end as cobertura_parcial_observada,
    max(m.faixa_atencao_min) as faixa_atencao_min,
    max(m.faixa_saudavel_min) as faixa_saudavel_min
  from metricas_calculadas m
  group by m.snapshot_id
)
select
  m.snapshot_id,
  m.professor_id,
  m.unidade_id,
  m.escopo,
  m.competencia,
  m.trimestre_inicio,
  m.periodicidade,
  m.periodo_inicio,
  m.periodo_fim,
  m.ciclo_codigo,
  case
    when m.estado_publicacao = 'oficial' then 'oficial'
    when a.score_parcial_observado is not null then 'parcial'
    else 'sem_base'
  end as estado_publicacao_parcial_observado,
  a.score_parcial_observado is not null as score_exibivel_parcial_observado,
  case
    when m.estado_publicacao = 'oficial' then m.ranking_habilitado_oficial
    else false
  end as ranking_habilitado,
  m.config_versao,
  m.revisao,
  a.score_parcial_observado,
  a.cobertura_parcial_observada,
  case
    when m.estado_publicacao = 'oficial' then m.classificacao_oficial
    when a.score_parcial_observado is null then null::text
    when a.score_parcial_observado >= a.faixa_saudavel_min then 'saudavel'
    when a.score_parcial_observado >= a.faixa_atencao_min then 'atencao'
    else 'critico'
  end as classificacao_parcial_observada,
  m.estado,
  m.snapshot_publicavel,
  m.publicado,
  case
    when m.estado_publicacao = 'oficial' then m.motivo_bloqueio_oficial
    when a.score_parcial_observado is not null
      then 'score parcial observado; ranking e premiacao dependem do fechamento oficial'
    else m.motivo_bloqueio_oficial
  end as motivo_bloqueio,
  case
    when m.estado_publicacao = 'oficial' then m.regra_versao_snapshot_oficial
    else 'health-score-professor-v3-parcial-observado-1'
  end as regra_versao_snapshot,
  m.metrica,
  m.valor_bruto,
  m.numerador,
  m.denominador,
  m.nota_parcial_observada,
  m.peso,
  m.peso_disponivel_parcial_observado,
  m.contribuicao_parcial_observada,
  m.meta_aplicada,
  m.amostra,
  m.estado_base,
  m.metrica_publicavel_oficial,
  m.confianca,
  m.fonte,
  m.regra_versao_metrica_oficial,
  m.motivo_sem_base,
  m.detalhes_oficiais || jsonb_build_object(
    'leitura_parcial_observada', m.estado_publicacao <> 'oficial',
    'nota_oficial', m.nota_oficial,
    'peso_disponivel_oficial', m.peso_disponivel_oficial,
    'contribuicao_oficial', m.contribuicao_oficial,
    'metrica_publicavel_oficial', m.metrica_publicavel_oficial
  ) as detalhes
from metricas_calculadas m
join snapshots_calculados a on a.snapshot_id = m.snapshot_id;

revoke all on public.vw_health_score_professor_v3_parcial_observado
  from public, anon, authenticated;
grant select on public.vw_health_score_professor_v3_parcial_observado
  to service_role;

create or replace function public.get_health_score_professor_v3_performance(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, contribuicao numeric,
  meta numeric, amostra integer, estado_base text, metrica_publicavel boolean,
  confianca text, fonte text, regra_versao_metrica text, motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERFORMANCE_INVALIDO: competencia e periodicidade obrigatorias'
      using errcode = '22023';
  end if;

  return query
  with candidatos as (
    select s.id,
      row_number() over (
        partition by s.professor_id
        order by (s.estado_publicacao = 'oficial') desc,
          s.revisao desc, s.criado_em desc, s.id desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
  ), snapshots as (
    select c.id from candidatos c where c.rn = 1
  )
  select
    v.professor_id, v.unidade_id, v.escopo, v.competencia,
    v.trimestre_inicio, v.periodicidade, v.periodo_inicio, v.periodo_fim,
    v.ciclo_codigo, v.estado_publicacao_parcial_observado,
    v.score_exibivel_parcial_observado, v.ranking_habilitado,
    v.config_versao, v.revisao, v.score_parcial_observado,
    v.cobertura_parcial_observada, v.classificacao_parcial_observada,
    v.estado, v.snapshot_publicavel, v.publicado, v.motivo_bloqueio,
    v.regra_versao_snapshot, v.metrica, v.valor_bruto, v.numerador,
    v.denominador, v.nota_parcial_observada, v.peso,
    v.peso_disponivel_parcial_observado, v.contribuicao_parcial_observada,
    v.meta_aplicada, v.amostra, v.estado_base,
    v.metrica_publicavel_oficial, v.confianca, v.fonte,
    v.regra_versao_metrica_oficial, v.motivo_sem_base, v.detalhes
  from snapshots s
  join public.vw_health_score_professor_v3_parcial_observado v
    on v.snapshot_id = s.id
  order by v.professor_id, case v.metrica
    when 'retencao' then 1 when 'permanencia' then 2
    when 'conversao' then 3 when 'media_turma' then 4
    when 'numero_alunos' then 5 when 'presenca' then 6 else 99 end;
end;
$$;

create or replace function public.get_health_score_professor_v3_snapshot_modal(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer,
  p_periodicidade text
)
returns table (
  professor_id integer, unidade_id uuid, escopo text, competencia date,
  trimestre_inicio date, periodicidade text, periodo_inicio date, periodo_fim date,
  ciclo_codigo text, estado_publicacao text, score_exibivel boolean,
  ranking_habilitado boolean, config_versao integer, revisao integer, score numeric,
  cobertura numeric, classificacao text, estado text, snapshot_publicavel boolean,
  publicado boolean, motivo_bloqueio text, regra_versao_snapshot text,
  metrica text, valor_bruto numeric, numerador numeric, denominador numeric,
  nota numeric, peso numeric, peso_disponivel boolean, contribuicao numeric,
  meta numeric, amostra integer, estado_base text, metrica_publicavel boolean,
  confianca text, fonte text, regra_versao_metrica text, motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();
  if p_competencia is null
     or p_professor_id is null
     or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_MODAL_INVALIDO: competencia, professor e periodicidade obrigatorios'
      using errcode = '22023';
  end if;

  return query
  with snapshot as (
    select s.id
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.professor_id = p_professor_id
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by (s.estado_publicacao = 'oficial') desc, s.revisao desc,
      s.criado_em desc, s.id desc
    limit 1
  )
  select
    v.professor_id, v.unidade_id, v.escopo, v.competencia,
    v.trimestre_inicio, v.periodicidade, v.periodo_inicio, v.periodo_fim,
    v.ciclo_codigo, v.estado_publicacao_parcial_observado,
    v.score_exibivel_parcial_observado, v.ranking_habilitado,
    v.config_versao, v.revisao, v.score_parcial_observado,
    v.cobertura_parcial_observada, v.classificacao_parcial_observada,
    v.estado, v.snapshot_publicavel, v.publicado, v.motivo_bloqueio,
    v.regra_versao_snapshot, v.metrica, v.valor_bruto, v.numerador,
    v.denominador, v.nota_parcial_observada, v.peso,
    v.peso_disponivel_parcial_observado, v.contribuicao_parcial_observada,
    v.meta_aplicada, v.amostra, v.estado_base,
    v.metrica_publicavel_oficial, v.confianca, v.fonte,
    v.regra_versao_metrica_oficial, v.motivo_sem_base, v.detalhes
  from snapshot s
  join public.vw_health_score_professor_v3_parcial_observado v
    on v.snapshot_id = s.id
  order by case v.metrica
    when 'retencao' then 1 when 'permanencia' then 2
    when 'conversao' then 3 when 'media_turma' then 4
    when 'numero_alunos' then 5 when 'presenca' then 6 else 99 end;
end;
$$;

revoke all on function public.get_health_score_professor_v3_performance(date, uuid, text)
  from public, anon;
revoke all on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer, text)
  from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(date, uuid, text)
  to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer, text)
  to authenticated, service_role;

comment on view public.vw_health_score_professor_v3_parcial_observado is
  'Leitura operacional V3: usa somente valores brutos reais e metas versionadas; nao altera snapshots nem libera ranking.';
comment on function public.get_health_score_professor_v3_performance(date, uuid, text) is
  'Performance V3: parcial observado para acompanhamento; ranking somente no snapshot oficial.';
