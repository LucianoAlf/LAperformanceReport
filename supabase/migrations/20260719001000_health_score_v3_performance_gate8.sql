-- Gate 8 / Task 18: leitura batch dos snapshots V3 para Performance e rankings.
-- Nao altera snapshots, configuracoes, motor V2 ou outros consumidores.

create or replace function public.get_health_score_professor_v3_performance(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
  professor_id integer,
  unidade_id uuid,
  escopo text,
  competencia date,
  trimestre_inicio date,
  config_versao integer,
  revisao integer,
  score numeric,
  cobertura numeric,
  classificacao text,
  estado text,
  snapshot_publicavel boolean,
  publicado boolean,
  motivo_bloqueio text,
  regra_versao_snapshot text,
  metrica text,
  valor_bruto numeric,
  numerador numeric,
  denominador numeric,
  nota numeric,
  peso numeric,
  peso_disponivel boolean,
  contribuicao numeric,
  meta numeric,
  amostra integer,
  estado_base text,
  metrica_publicavel boolean,
  confianca text,
  fonte text,
  regra_versao_metrica text,
  motivo_sem_base text,
  detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_health_score_professor_v3_ator_gerenciador();

  if p_competencia is null then
    raise exception 'HEALTH_SCORE_V3_PERFORMANCE_INVALIDO: competencia obrigatoria'
      using errcode = '22023';
  end if;

  return query
  with candidatos as (
    select
      s.*,
      row_number() over (
        partition by s.professor_id
        order by s.revisao desc, s.criado_em desc, s.id desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.unidade_id is not distinct from p_unidade_id
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
  ), snapshots as (
    select c.*
    from candidatos c
    where rn = 1
  )
  select
    s.professor_id,
    s.unidade_id,
    s.escopo,
    s.competencia,
    s.trimestre_inicio,
    s.config_versao,
    s.revisao,
    s.score,
    s.cobertura,
    s.classificacao,
    s.estado,
    s.publicavel as snapshot_publicavel,
    s.publicado,
    s.motivo_bloqueio,
    s.regra_versao as regra_versao_snapshot,
    m.metrica,
    m.valor_bruto,
    m.numerador,
    m.denominador,
    m.nota,
    m.peso,
    m.peso_disponivel,
    m.contribuicao,
    m.meta_aplicada as meta,
    m.amostra,
    m.estado_base,
    m.publicavel as metrica_publicavel,
    m.confianca,
    m.fonte,
    m.regra_versao as regra_versao_metrica,
    m.motivo_sem_base,
    coalesce(m.detalhes, '{}'::jsonb) as detalhes
  from snapshots s
  join public.health_score_professor_v3_snapshot_metricas m
    on m.snapshot_id = s.id
  order by s.professor_id,
    case m.metrica
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

revoke all on function public.get_health_score_professor_v3_performance(date, uuid)
  from public, anon, authenticated;

grant execute on function public.get_health_score_professor_v3_performance(date, uuid)
  to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance(date, uuid) is
  'Gate 8 Task 18: lote auditavel da ultima revisao V3 por professor e escopo exato para Performance e rankings sob feature flag.';
