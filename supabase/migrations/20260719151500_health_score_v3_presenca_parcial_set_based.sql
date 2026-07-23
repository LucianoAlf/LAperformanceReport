-- Health Score Professor V3 - otimiza a presenca parcial por recorte.
--
-- A versao anterior chamava a frequencia canonica uma vez por snapshot de
-- professor. Esta revisao executa a fonte uma vez por unidade/competencia e
-- distribui o resultado por professor, sem alterar snapshots materializados.

create or replace view public.vw_health_score_professor_v3_parcial_operacional
with (security_invoker = true)
as
with presenca_alvos as (
  select distinct
    v.snapshot_id,
    v.professor_id,
    v.unidade_id,
    v.competencia,
    v.periodo_inicio,
    least(v.periodo_fim, current_date) as periodo_fim_observado
  from public.vw_health_score_professor_v3_parcial_observado v
  where v.metrica = 'presenca'
    and v.estado_publicacao_parcial_observado <> 'oficial'
    and v.valor_bruto is null
    and v.periodo_inicio <= least(v.periodo_fim, current_date)
), presenca_recortes as materialized (
  select distinct
    a.unidade_id,
    a.competencia,
    a.periodo_inicio,
    a.periodo_fim_observado
  from presenca_alvos a
), presenca_resultados as materialized (
  select
    r.unidade_id as unidade_recorte_id,
    r.competencia,
    r.periodo_inicio,
    r.periodo_fim_observado,
    f.professor_id,
    f.presencas_confirmadas,
    f.faltas_confirmadas,
    f.eventos_resultado_confirmado,
    f.faltas_provaveis + f.chamadas_indeterminadas as eventos_incertos
  from presenca_recortes r
  cross join lateral public.get_frequencia_professor_periodo_canonica_v1(
    extract(year from r.competencia)::integer,
    extract(month from r.competencia)::integer,
    r.unidade_id,
    r.periodo_inicio,
    r.periodo_fim_observado
  ) f
  where f.eventos_resultado_confirmado > 0
), presenca_fallback as (
  select
    a.snapshot_id,
    sum(f.presencas_confirmadas)::numeric as presentes,
    sum(f.faltas_confirmadas)::numeric as faltas_confirmadas,
    sum(f.eventos_resultado_confirmado)::numeric as eventos_confirmados,
    sum(f.eventos_incertos)::numeric as eventos_incertos,
    round(
      sum(f.presencas_confirmadas)::numeric
      / nullif(sum(f.eventos_resultado_confirmado), 0)
      * 100,
      2
    ) as valor_bruto
  from presenca_alvos a
  join presenca_resultados f
    on f.unidade_recorte_id = a.unidade_id
   and f.competencia = a.competencia
   and f.periodo_inicio = a.periodo_inicio
   and f.periodo_fim_observado = a.periodo_fim_observado
   and f.professor_id = a.professor_id
  where exists (
    select 1
    from public.presenca_politicas_confiabilidade p
    where p.unidade_id = a.unidade_id
      and p.ativa
      and p.exige_revisao_operacional = false
      and p.data_inicio <= a.periodo_fim_observado
      and p.data_fim >= a.periodo_inicio
  )
  group by a.snapshot_id
), metricas_ajustadas as (
  select
    v.*,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        then pf.valor_bruto
      else v.valor_bruto
    end as valor_bruto_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        then pf.presentes
      else v.numerador
    end as numerador_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        then pf.eventos_confirmados
      else v.denominador
    end as denominador_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        then pf.eventos_confirmados::integer
      else v.amostra
    end as amostra_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null and v.meta_aplicada > 0
      then round(least(
        100::numeric,
        greatest(0::numeric, pf.valor_bruto / v.meta_aplicada * 100)
      ), 2)
      else v.nota_parcial_observada
    end as nota_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null then true
      else v.peso_disponivel_parcial_observado
    end as peso_disponivel_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null and v.meta_aplicada > 0
      then round(
        least(100::numeric, greatest(0::numeric, pf.valor_bruto / v.meta_aplicada * 100))
        * v.peso / 100,
        4
      )
      else v.contribuicao_parcial_observada
    end as contribuicao_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null then 'observado'
      else v.estado_base
    end as estado_base_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null then 'alta'
      else v.confianca
    end as confianca_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null
        then 'get_frequencia_professor_periodo_canonica_v1+presenca_politicas_confiabilidade'
      else v.fonte
    end as fonte_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null then 'presenca-sem-roster-historico-v1'
      else v.regra_versao_metrica_oficial
    end as regra_versao_metrica_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null then null::text
      else v.motivo_sem_base
    end as motivo_sem_base_operacional,
    case
      when v.metrica = 'presenca' and v.valor_bruto is null
        and pf.valor_bruto is not null
      then v.detalhes || jsonb_build_object(
        'presenca_parcial_canonica', true,
        'fonte_presenca_parcial', 'vw_aluno_presenca_semantica_v1',
        'roster_historico_indisponivel', true,
        'eventos_confirmados', pf.eventos_confirmados,
        'presentes', pf.presentes,
        'faltas_confirmadas', pf.faltas_confirmadas,
        'eventos_incertos', pf.eventos_incertos,
        'observacao_publicacao', 'normal'
      )
      else v.detalhes
    end as detalhes_operacionais
  from public.vw_health_score_professor_v3_parcial_observado v
  left join presenca_fallback pf on pf.snapshot_id = v.snapshot_id
), scores as (
  select
    m.snapshot_id,
    case
      when max(m.estado_publicacao_parcial_observado) = 'oficial'
        then max(m.score_parcial_observado)
      when sum(m.peso) filter (where m.peso_disponivel_operacional) > 0
        then round(
          sum(m.contribuicao_operacional)
            filter (where m.peso_disponivel_operacional)
          * 100
          / sum(m.peso) filter (where m.peso_disponivel_operacional),
          2
        )
      else null::numeric
    end as score_operacional,
    case
      when max(m.estado_publicacao_parcial_observado) = 'oficial'
        then max(m.cobertura_parcial_observada)
      else coalesce(
        sum(m.peso) filter (where m.peso_disponivel_operacional),
        0::numeric
      )
    end as cobertura_operacional,
    max(c.faixa_atencao_min) as faixa_atencao_min,
    max(c.faixa_saudavel_min) as faixa_saudavel_min
  from metricas_ajustadas m
  join public.health_score_professor_v3_snapshots s on s.id = m.snapshot_id
  join public.health_score_professor_v3_config_versoes c on c.id = s.config_id
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
    when m.estado_publicacao_parcial_observado = 'oficial' then 'oficial'
    when s.score_operacional is not null then 'parcial'
    else 'sem_base'
  end as estado_publicacao,
  s.score_operacional is not null as score_exibivel,
  m.ranking_habilitado,
  m.config_versao,
  m.revisao,
  s.score_operacional as score,
  s.cobertura_operacional as cobertura,
  case
    when m.estado_publicacao_parcial_observado = 'oficial'
      then m.classificacao_parcial_observada
    when s.score_operacional is null then null::text
    when s.score_operacional >= s.faixa_saudavel_min then 'saudavel'
    when s.score_operacional >= s.faixa_atencao_min then 'atencao'
    else 'critico'
  end as classificacao,
  m.estado,
  m.snapshot_publicavel,
  m.publicado,
  case
    when m.estado_publicacao_parcial_observado = 'oficial' then m.motivo_bloqueio
    when s.score_operacional is not null
      then 'score parcial operacional; ranking e premiacao dependem do fechamento oficial'
    else m.motivo_bloqueio
  end as motivo_bloqueio,
  case
    when m.estado_publicacao_parcial_observado = 'oficial'
      then m.regra_versao_snapshot
    else 'health-score-professor-v3-parcial-operacional-2'
  end as regra_versao_snapshot,
  m.metrica,
  m.valor_bruto_operacional as valor_bruto,
  m.numerador_operacional as numerador,
  m.denominador_operacional as denominador,
  m.nota_operacional as nota,
  m.peso,
  m.peso_disponivel_operacional as peso_disponivel,
  m.contribuicao_operacional as contribuicao,
  m.meta_aplicada as meta,
  m.amostra_operacional as amostra,
  m.estado_base_operacional as estado_base,
  m.metrica_publicavel_oficial as metrica_publicavel,
  m.confianca_operacional as confianca,
  m.fonte_operacional as fonte,
  m.regra_versao_metrica_operacional as regra_versao_metrica,
  m.motivo_sem_base_operacional as motivo_sem_base,
  m.detalhes_operacionais as detalhes
from metricas_ajustadas m
join scores s on s.snapshot_id = m.snapshot_id;

revoke all on public.vw_health_score_professor_v3_parcial_operacional
  from public, anon, authenticated;
grant select on public.vw_health_score_professor_v3_parcial_operacional
  to service_role;

comment on view public.vw_health_score_professor_v3_parcial_operacional is
  'Leitura operacional V3 set-based. Presenca de Barra/Recreio e calculada uma vez por recorte; Campo Grande permanece fora do score.';
