-- Gate 8: read model auditavel para o modal individual em homologacao.
-- Nao altera snapshots, configuracoes ou consumidores V2.

create or replace function public.get_health_score_professor_v3_snapshot_modal(
  p_competencia date,
  p_unidade_id uuid,
  p_professor_id integer
)
returns table (
  professor_id integer,
  unidade_id uuid,
  escopo text,
  competencia date,
  trimestre_inicio date,
  config_versao integer,
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

  if p_competencia is null or p_professor_id is null then
    raise exception 'HEALTH_SCORE_V3_MODAL_INVALIDO: competencia e professor obrigatorios'
      using errcode = '22023';
  end if;

  return query
  with snapshot as (
    select s.*
    from public.health_score_professor_v3_snapshots s
    where s.competencia = date_trunc('month', p_competencia)::date
      and s.professor_id = p_professor_id
      and s.unidade_id is not distinct from p_unidade_id
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
    order by s.revisao desc
    limit 1
  )
  select
    s.professor_id,
    s.unidade_id,
    s.escopo,
    s.competencia,
    s.trimestre_inicio,
    s.config_versao,
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

revoke all on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer)
  to authenticated, service_role;

comment on function public.get_health_score_professor_v3_snapshot_modal(date, uuid, integer) is
  'Gate 8: leitura exata e auditavel de um snapshot V3 por professor, competencia e unidade/consolidado; homologacao sob feature flag.';
