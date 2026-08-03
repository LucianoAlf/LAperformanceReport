-- Evita recalcular a agregacao segmentada no mesmo ciclo.
-- get_health_score_professor_v3_metricas_periodo ja entrega media_turma e
-- numero_alunos pela fonte segmentada canonica, incluindo nota_segmentada em
-- detalhes. A segunda chamada duplicava o trecho mais caro da consulta.

create or replace function public.get_health_score_professor_v3_projecao_viva(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
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
begin
  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_hs_prof_v3_projecao_viva_base_20260803(
      p_competencia, p_unidade_id, 'mensal'
    ) b;
    return;
  elsif p_periodicidade <> 'ciclo' then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  return query
  with periodo as (
    select p.*
    from public.fn_health_score_v3_periodo(p_competencia, 'ciclo') p
  ),
  configuracao as (
    select c.*
    from public.health_score_professor_v3_config_versoes c
    where c.status = 'ativa'
      and c.vigencia_inicio <= date_trunc('month', p_competencia)::date
      and (c.vigencia_fim is null
        or c.vigencia_fim >= date_trunc('month', p_competencia)::date)
    order by c.vigencia_inicio desc, c.versao desc, c.id desc
    limit 1
  ),
  base as (
    select m.*
    from public.get_health_score_professor_v3_metricas_periodo(
      p_competencia, p_unidade_id, 'ciclo'
    ) m
  ),
  preparadas as (
    select
      b.*,
      c.id as config_id,
      c.versao as config_versao_atual,
      cm.peso,
      cm.meta,
      cm.amostra_minima,
      b.valor_bruto as valor_resolvido,
      b.numerador as numerador_resolvido,
      b.denominador as denominador_resolvido,
      b.amostra as amostra_resolvida,
      case
        when b.metrica = 'media_turma' then coalesce(
          nullif(b.detalhes ->> 'nota_segmentada', '')::numeric,
          case
            when b.estado_base = 'ok' and b.denominador > 0 then round(
              least(100::numeric, 100::numeric * b.numerador
                / nullif(b.denominador, 0)),
              2
            )
          end
        )
        else null::numeric
      end as nota_segmentada,
      case
        when b.metrica = 'numero_alunos' then 'diagnostico_carteira'
        when b.metrica = 'conversao' and coalesce(b.denominador, 0) = 0
          then 'sem_experimental_ciclo'
        when b.metrica = 'conversao' and coalesce(b.amostra, 0) < coalesce(cm.amostra_minima, 3)
          then 'amostra_experimental_insuficiente'
        when b.metrica = 'permanencia' and coalesce(b.denominador, 0) = 0
          then 'sem_vinculos_encerrados_elegiveis'
        when b.metrica = 'permanencia' and coalesce(b.amostra, 0) < coalesce(cm.amostra_minima, 1)
          then 'amostra_vinculos_insuficiente'
        when b.metrica = 'presenca' and coalesce(b.denominador, 0) = 0
          then 'sem_aulas_elegiveis_mes'
        when b.metrica = 'presenca' and b.valor_bruto is null
          then 'presenca_ainda_nao_registrada_mes'
        when b.fonte is null or nullif(btrim(b.fonte), '') is null
          then 'fonte_canonica_indisponivel'
        else coalesce(b.detalhes ->> 'codigo_evidencia', 'evidencia_ciclo_disponivel')
      end::text as codigo_evidencia_resolvido
    from base b
    cross join configuracao c
    left join public.health_score_professor_v3_config_metricas cm
      on cm.config_id = c.id and cm.metrica = b.metrica
  )
  select
    b.professor_id,
    b.unidade_id,
    case when p_unidade_id is null then 'consolidado' else 'unidade' end::text,
    date_trunc('month', p_competencia)::date,
    p.periodo_inicio,
    'ciclo'::text,
    p.periodo_inicio,
    p.periodo_fim,
    p.ciclo_codigo,
    'ciclo_em_acompanhamento'::text,
    false,
    false,
    b.config_versao_atual,
    0,
    null::numeric,
    0::numeric,
    'sem_base'::text,
    'em_andamento'::text,
    false,
    false,
    'ciclo_em_acompanhamento'::text,
    'health-score-professor-v3-ciclo-vivo-2'::text,
    b.metrica,
    b.valor_resolvido,
    b.numerador_resolvido,
    b.denominador_resolvido,
    b.nota_segmentada,
    coalesce(b.peso, 0),
    case
      when b.metrica = 'numero_alunos' then false
      when b.metrica = 'presenca' and p.periodo_inicio < date '2026-08-03' then false
      when b.metrica = 'conversao' then
        b.valor_resolvido is not null
          and coalesce(b.amostra_resolvida, 0) >= coalesce(b.amostra_minima, 3)
      when b.metrica = 'media_turma' then
        b.nota_segmentada is not null
          and coalesce(b.amostra_resolvida, 0) >= coalesce(b.amostra_minima, 1)
      else
        b.valor_resolvido is not null
          and coalesce(b.amostra_resolvida, 0) >= coalesce(b.amostra_minima, 1)
          and b.estado_base not in (
            'sem_base', 'sem_base_amostra', 'em_auditoria', 'bloqueada',
            'segmentacao_incompleta', 'fonte_indisponivel'
          )
    end,
    0::numeric,
    null::numeric,
    b.meta,
    b.amostra_resolvida,
    b.estado_base,
    b.publicavel,
    b.confianca,
    b.fonte,
    'health-score-professor-v3-ciclo-vivo-2'::text,
    b.motivo_sem_base,
    b.codigo_evidencia_resolvido,
    case when b.metrica = 'numero_alunos' then 'diagnostico' else 'nota' end::text,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'periodicidade', 'ciclo',
      'periodo_inicio', p.periodo_inicio,
      'periodo_fim', p.periodo_fim,
      'data_corte', least(current_date, p.periodo_fim),
      'referencia_historica', case
        when b.metrica = 'presenca' and p.periodo_inicio < date '2026-08-03'
          then jsonb_build_object(
            'vigencia_pontuavel_inicio', date '2026-08-03',
            'nao_compoe_nota_atual', true,
            'motivo', 'ciclo contem eventos anteriores a vigencia pontuavel'
          )
        else null
      end,
      'motivo_auditoria', case
        when b.codigo_evidencia_resolvido = 'fonte_canonica_indisponivel'
          then 'fonte do pilar ausente no produtor canonico'
        else null
      end
    )
  from preparadas b
  cross join periodo p;
end;
$function$;

comment on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) is
  'Projecao mensal/ciclo V3. O ciclo reutiliza a metrica segmentada canonica ja produzida, sem recalculo duplicado.';

