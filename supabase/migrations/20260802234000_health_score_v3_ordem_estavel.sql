begin;

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
  nota numeric, peso numeric, peso_disponivel boolean, peso_efetivo numeric,
  contribuicao numeric, meta numeric, amostra integer, estado_base text,
  metrica_publicavel boolean, confianca text, fonte text,
  regra_versao_metrica text, motivo_sem_base text, codigo_evidencia text,
  papel text, detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_competencia_atual date := date_trunc(
    'month', timezone('America/Sao_Paulo', now())
  )::date;
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERFORMANCE_INVALIDO: competencia e periodicidade obrigatorias'
      using errcode = '22023';
  end if;

  if v_competencia = v_competencia_atual and p_periodicidade = 'mensal' then
    return query
    with oficiais as (
      select s.professor_id
      from public.health_score_professor_v3_snapshots s
      where s.competencia = v_competencia
        and s.unidade_id is not distinct from p_unidade_id
        and s.periodicidade = p_periodicidade
        and s.estado_publicacao = 'oficial'
        and s.invalidado_em is null
    ),
    projecao_base as (
      select
        v.*,
        coalesce(c.cobertura_minima, 60::numeric) as cobertura_minima
      from public.get_health_score_professor_v3_projecao_viva(
        v_competencia,
        p_unidade_id,
        p_periodicidade
      ) v
      left join lateral (
        select cfg.cobertura_minima
        from public.health_score_professor_v3_config_versoes cfg
        where cfg.versao = v.config_versao
          and cfg.vigencia_inicio <= v_competencia
          and (cfg.vigencia_fim is null or cfg.vigencia_fim >= v_competencia)
        order by cfg.vigencia_inicio desc, cfg.id desc
        limit 1
      ) c on true
      where not exists (
        select 1 from oficiais o where o.professor_id = v.professor_id
      )
    ),
    referencias_score_ordenadas as (
      select
        s.professor_id,
        s.competencia as competencia_referencia,
        s.score as score_referencia,
        s.classificacao as classificacao_referencia,
        row_number() over (
          partition by s.professor_id
          order by
            s.competencia desc,
            (s.estado_publicacao = 'oficial') desc,
            s.revisao desc,
            s.criado_em desc,
            s.id desc
        ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.competencia < v_competencia
        and s.unidade_id is not distinct from p_unidade_id
        and s.periodicidade = p_periodicidade
        and s.estado in ('provisorio', 'em_maturacao', 'fechado')
        and s.invalidado_em is null
        and s.score_exibivel
        and s.score is not null
    ),
    referencia_score as (
      select r.*
      from referencias_score_ordenadas r
      where r.rn = 1
    ),
    projecao_viva as (
      select
        p.*,
        r.competencia_referencia,
        r.score_referencia,
        r.classificacao_referencia,
        (
          (p.score is null or p.cobertura < p.cobertura_minima)
          and r.score_referencia is not null
        ) as usa_score_referencia
      from projecao_base p
      left join referencia_score r on r.professor_id = p.professor_id
    ),
    snapshots_oficiais as (
      select
        s.*,
        row_number() over (
          partition by s.professor_id
          order by s.revisao desc, s.criado_em desc, s.id desc
        ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.competencia = v_competencia
        and s.unidade_id is not distinct from p_unidade_id
        and s.periodicidade = p_periodicidade
        and s.estado_publicacao = 'oficial'
        and s.invalidado_em is null
    )
    select
      p.professor_id, p.unidade_id, p.escopo, p.competencia,
      p.trimestre_inicio, p.periodicidade, p.periodo_inicio, p.periodo_fim,
      p.ciclo_codigo, 'em_andamento'::text,
      (p.score_exibivel or p.usa_score_referencia),
      false,
      p.config_versao, p.revisao,
      case when p.usa_score_referencia then p.score_referencia else p.score end,
      p.cobertura,
      case
        when p.usa_score_referencia then p.classificacao_referencia
        else p.classificacao
      end,
      p.estado, p.snapshot_publicavel, p.publicado, p.motivo_bloqueio,
      'health-score-professor-v3-mes-vivo-estavel-1'::text,
      p.metrica, p.valor_bruto, p.numerador, p.denominador,
      p.nota, p.peso, p.peso_disponivel, p.peso_efetivo,
      p.contribuicao, p.meta, p.amostra, p.estado_base,
      p.metrica_publicavel, p.confianca, p.fonte,
      p.regra_versao_metrica, p.motivo_sem_base, p.codigo_evidencia,
      p.papel,
      coalesce(p.detalhes, '{}'::jsonb) || case
        when p.usa_score_referencia then jsonb_build_object(
          'score_operacional_origem', 'competencia_anterior',
          'score_competencia_referencia', p.competencia_referencia,
          'score_referencia', p.score_referencia,
          'score_atual_em_formacao', p.score,
          'cobertura_atual', p.cobertura,
          'cobertura_minima', p.cobertura_minima
        )
        else jsonb_build_object(
          'score_operacional_origem', 'competencia_atual',
          'cobertura_atual', p.cobertura,
          'cobertura_minima', p.cobertura_minima
        )
      end
    from projecao_viva p
    union all
    select
      s.professor_id, s.unidade_id, s.escopo, s.competencia,
      s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
      s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
      s.ranking_habilitado, s.config_versao, s.revisao, s.score,
      s.cobertura, s.classificacao, s.estado,
      s.publicavel, s.publicado, s.motivo_bloqueio, s.regra_versao,
      m.metrica, m.valor_bruto, m.numerador, m.denominador, m.nota,
      m.peso, m.peso_disponivel, m.peso_efetivo, m.contribuicao,
      m.meta_aplicada, m.amostra, m.estado_base, m.publicavel, m.confianca,
      m.fonte, m.regra_versao, m.motivo_sem_base, m.codigo_evidencia,
      m.papel, coalesce(m.detalhes, '{}'::jsonb)
    from snapshots_oficiais s
    join public.health_score_professor_v3_snapshot_metricas m on m.snapshot_id = s.id
    where s.rn = 1;
    return;
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
    where s.competencia = v_competencia
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
      and s.invalidado_em is null
  )
  select
    s.professor_id, s.unidade_id, s.escopo, s.competencia,
    s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
    s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
    s.ranking_habilitado, s.config_versao, s.revisao, s.score,
    s.cobertura, s.classificacao, s.estado,
    s.publicavel, s.publicado, s.motivo_bloqueio, s.regra_versao,
    m.metrica, m.valor_bruto, m.numerador, m.denominador, m.nota,
    m.peso, m.peso_disponivel, m.peso_efetivo, m.contribuicao,
    m.meta_aplicada, m.amostra, m.estado_base, m.publicavel, m.confianca,
    m.fonte, m.regra_versao, m.motivo_sem_base, m.codigo_evidencia,
    m.papel, coalesce(m.detalhes, '{}'::jsonb)
  from candidatos s
  join public.health_score_professor_v3_snapshot_metricas m on m.snapshot_id = s.id
  where s.rn = 1;
end;
$function$;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Leitura V3: competencia viva usa score corrente somente com cobertura minima; antes disso preserva a ultima nota valida sem alterar snapshots.';

commit;
