-- Cutover dos consumidores V3 para a revisao governada materializada.
-- Remove o recálculo paralelo da vitrine sem alterar assinaturas ou grants do frontend.

do $$
declare
  v_dependencia record;
begin
  select
    d.classid::regclass::text as tipo,
    d.objid
  into v_dependencia
  from pg_depend d
  where d.refobjid in (
      'public.get_health_score_professor_v3_performance(date,uuid,text)'::regprocedure::oid,
      'public.get_health_score_professor_v3_snapshot_modal(date,uuid,integer,text)'::regprocedure::oid
    )
    and d.classid in (
      'pg_constraint'::regclass,
      'pg_trigger'::regclass,
      'pg_attrdef'::regclass
    )
  limit 1;

  if found then
    raise exception
      'HEALTH_SCORE_V3_CONSUMIDOR_DEPENDENCIA_INTERNA: % %',
      v_dependencia.tipo,
      v_dependencia.objid;
  end if;
end;
$$;

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
    select
      s.*,
      row_number() over (
        partition by s.professor_id
        order by
          (s.estado_publicacao = 'oficial') desc,
          s.revisao desc,
          s.criado_em desc,
          s.id desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
  ),
  snapshots as (
    select c.*
    from candidatos c
    where c.rn = 1
  )
  select
    s.professor_id, s.unidade_id, s.escopo, s.competencia,
    s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
    s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
    s.ranking_habilitado, s.config_versao, s.revisao, s.score,
    s.cobertura, s.classificacao, s.estado,
    s.publicavel as snapshot_publicavel, s.publicado, s.motivo_bloqueio,
    s.regra_versao as regra_versao_snapshot,
    m.metrica, m.valor_bruto, m.numerador, m.denominador, m.nota,
    m.peso, m.peso_disponivel, m.contribuicao,
    m.meta_aplicada as meta, m.amostra, m.estado_base,
    m.publicavel as metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb) as detalhes
  from snapshots s
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
  order by s.professor_id, case m.metrica
    when 'retencao' then 1
    when 'permanencia' then 2
    when 'conversao' then 3
    when 'media_turma' then 4
    when 'numero_alunos' then 5
    when 'presenca' then 6
    else 99
  end;
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
    select s.*
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.professor_id = p_professor_id
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by
      (s.estado_publicacao = 'oficial') desc,
      s.revisao desc,
      s.criado_em desc,
      s.id desc
    limit 1
  )
  select
    s.professor_id, s.unidade_id, s.escopo, s.competencia,
    s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
    s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
    s.ranking_habilitado, s.config_versao, s.revisao, s.score,
    s.cobertura, s.classificacao, s.estado,
    s.publicavel as snapshot_publicavel, s.publicado, s.motivo_bloqueio,
    s.regra_versao as regra_versao_snapshot,
    m.metrica, m.valor_bruto, m.numerador, m.denominador, m.nota,
    m.peso, m.peso_disponivel, m.contribuicao,
    m.meta_aplicada as meta, m.amostra, m.estado_base,
    m.publicavel as metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb) as detalhes
  from snapshot s
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
  order by case m.metrica
    when 'retencao' then 1
    when 'permanencia' then 2
    when 'conversao' then 3
    when 'media_turma' then 4
    when 'numero_alunos' then 5
    when 'presenca' then 6
    else 99
  end;
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

comment on function public.get_health_score_professor_v3_performance(date, uuid, text) is
  'Performance V3 baseada exclusivamente na revisao materializada governada. Ranking somente em snapshot oficial.';
comment on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer, text) is
  'Detalhe V3 baseado exclusivamente na revisao materializada governada. Nao recomputa pesos indisponiveis.';
