begin;

-- O snapshot preserva os bloqueios internos de qualidade para governanca, mas
-- a leitura operacional do periodo aberto deve mostrar o fato ja observado.
-- Nao reutilizamos agosto como se fosse setembro: presenca usa os contadores
-- correntes ja carregados pelo produtor canonico e conversao sem experimental
-- permanece sem evento no recorte. Nenhum desses ajustes altera a nota.
alter function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) rename to get_hs_prof_v3_snapshot_before_evid_corrente_20260909;

revoke all on function public.get_hs_prof_v3_snapshot_before_evid_corrente_20260909(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_snapshot_before_evid_corrente_20260909(
  date, uuid, text
) to service_role;

create or replace function public.get_health_score_professor_v3_performance_snapshot_v3(
  p_competencia date,
  p_unidade_id uuid,
  p_periodicidade text
)
returns table (
  professor_id integer,
  unidade_id uuid,
  escopo text,
  competencia date,
  trimestre_inicio date,
  periodicidade text,
  periodo_inicio date,
  periodo_fim date,
  ciclo_codigo text,
  estado_publicacao text,
  score_exibivel boolean,
  ranking_habilitado boolean,
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
  peso_efetivo numeric,
  contribuicao numeric,
  meta numeric,
  amostra integer,
  estado_base text,
  metrica_publicavel boolean,
  confianca text,
  fonte text,
  regra_versao_metrica text,
  motivo_sem_base text,
  codigo_evidencia text,
  papel text,
  detalhes jsonb,
  score_observado numeric,
  score_comparavel numeric,
  pilares_validos integer,
  pilares_esperados integer,
  comparabilidade_estado text,
  comparabilidade_motivo text,
  competencia_referencia date,
  score_referencia numeric,
  classificacao_referencia text,
  data_corte date,
  config_id uuid,
  regra_fingerprint text,
  peso_pontuavel_total numeric,
  peso_disponivel_total numeric,
  cobertura_normalizada numeric,
  cobertura_minima_aplicada numeric,
  comparabilidade_motivos jsonb,
  retrato_calculado_em timestamptz,
  retrato_execucao_id uuid,
  retrato_estado text,
  retrato_defasagem_minutos numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with base as (
    select b.*
    from public.get_hs_prof_v3_snapshot_before_evid_corrente_20260909(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) b
  ), preparada as (
    select
      b.*,
      (
        coalesce(b.ranking_habilitado, false) is false
        and b.estado_publicacao in ('em_andamento', 'ciclo_em_acompanhamento')
      ) as periodo_aberto,
      nullif(b.detalhes ->> 'presentes_observados', '')::numeric
        as presentes_observados,
      nullif(b.detalhes ->> 'denominador_observado', '')::numeric
        as denominador_observado,
      coalesce(
        nullif(b.detalhes ->> 'experimentais_confirmadas', '')::numeric,
        0::numeric
      ) as experimentais_confirmadas,
      coalesce(
        nullif(b.detalhes ->> 'matriculas_creditadas', '')::numeric,
        0::numeric
      ) as matriculas_creditadas,
      coalesce(
        nullif(b.detalhes ->> 'referencia_temporaria', '')::boolean,
        false
      ) as referencia_temporaria
    from base b
  ), normalizada as (
    select
      p.*,
      (
        p.periodo_aberto
        and p.metrica = 'presenca'
        and coalesce(p.denominador_observado, 0) > 0
      ) as usar_presenca_corrente,
      (
        p.periodo_aberto
        and p.metrica = 'conversao'
        and p.referencia_temporaria
      ) as remover_conversao_anterior
    from preparada p
  )
  select
    n.professor_id,
    n.unidade_id,
    n.escopo,
    n.competencia,
    n.trimestre_inicio,
    n.periodicidade,
    n.periodo_inicio,
    n.periodo_fim,
    n.ciclo_codigo,
    n.estado_publicacao,
    n.score_exibivel,
    n.ranking_habilitado,
    n.config_versao,
    n.revisao,
    n.score,
    n.cobertura,
    n.classificacao,
    n.estado,
    n.snapshot_publicavel,
    n.publicado,
    n.motivo_bloqueio,
    n.regra_versao_snapshot,
    n.metrica,
    case
      when n.usar_presenca_corrente then round(
        n.presentes_observados * 100 / nullif(n.denominador_observado, 0),
        2
      )
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then round(
        n.matriculas_creditadas * 100 / n.experimentais_confirmadas,
        2
      )
      when n.remover_conversao_anterior then null::numeric
      else n.valor_bruto
    end as valor_bruto,
    case
      when n.usar_presenca_corrente then n.presentes_observados
      when n.remover_conversao_anterior then n.matriculas_creditadas
      else n.numerador
    end as numerador,
    case
      when n.usar_presenca_corrente then n.denominador_observado
      when n.remover_conversao_anterior then n.experimentais_confirmadas
      else n.denominador
    end as denominador,
    n.nota,
    n.peso,
    n.peso_disponivel,
    n.peso_efetivo,
    n.contribuicao,
    n.meta,
    case
      when n.usar_presenca_corrente then n.denominador_observado::integer
      when n.remover_conversao_anterior then n.experimentais_confirmadas::integer
      else n.amostra
    end as amostra,
    case
      when n.usar_presenca_corrente then 'em_andamento'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then 'em_andamento'
      when n.remover_conversao_anterior then 'sem_base'
      else n.estado_base
    end as estado_base,
    case
      when n.usar_presenca_corrente or n.remover_conversao_anterior then false
      else n.metrica_publicavel
    end as metrica_publicavel,
    case
      when n.usar_presenca_corrente then 'parcial'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas > 0 then 'parcial'
      when n.remover_conversao_anterior then 'sem_base'
      else n.confianca
    end as confianca,
    n.fonte,
    case
      when n.usar_presenca_corrente or n.remover_conversao_anterior
        then 'health-score-professor-v3-evidencia-corrente-1'
      else n.regra_versao_metrica
    end as regra_versao_metrica,
    case
      when n.usar_presenca_corrente
        then 'Evidencia corrente do periodo em andamento; nao compoe a nota ate o fechamento.'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas = 0
        then 'Nenhuma aula experimental confirmada no periodo.'
      when n.remover_conversao_anterior
        then 'Conversao corrente do periodo em andamento; nao compoe a nota ate o fechamento.'
      else n.motivo_sem_base
    end as motivo_sem_base,
    case
      when n.usar_presenca_corrente then 'evidencia_observada_em_andamento'
      when n.remover_conversao_anterior
           and n.experimentais_confirmadas = 0 then 'sem_experimental_mes'
      when n.remover_conversao_anterior then 'evidencia_observada_em_andamento'
      else n.codigo_evidencia
    end as codigo_evidencia,
    n.papel,
    case
      when n.usar_presenca_corrente then
        coalesce(n.detalhes, '{}'::jsonb) || jsonb_build_object(
          'referencia_temporaria', false,
          'competencia_referencia', null,
          'valor_referencia', null,
          'nao_compoe_nota_atual', true,
          'presenca_observada_em_andamento', true,
          'estado_publicacao', 'em_andamento'
        )
      when n.remover_conversao_anterior then
        coalesce(n.detalhes, '{}'::jsonb) || jsonb_build_object(
          'referencia_temporaria', false,
          'competencia_referencia', null,
          'valor_referencia', null,
          'nao_compoe_nota_atual', true,
          'conversao_observada_em_andamento', n.experimentais_confirmadas > 0
        )
      else n.detalhes
    end as detalhes,
    n.score_observado,
    n.score_comparavel,
    n.pilares_validos,
    n.pilares_esperados,
    n.comparabilidade_estado,
    n.comparabilidade_motivo,
    case
      when n.usar_presenca_corrente or n.remover_conversao_anterior then null::date
      else n.competencia_referencia
    end as competencia_referencia,
    n.score_referencia,
    n.classificacao_referencia,
    n.data_corte,
    n.config_id,
    n.regra_fingerprint,
    n.peso_pontuavel_total,
    n.peso_disponivel_total,
    n.cobertura_normalizada,
    n.cobertura_minima_aplicada,
    n.comparabilidade_motivos,
    n.retrato_calculado_em,
    n.retrato_execucao_id,
    n.retrato_estado,
    n.retrato_defasagem_minutos
  from normalizada n;
$function$;

revoke all on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance_snapshot_v3(
  date, uuid, text
) is
  'Leitor materializado do painel: em periodo aberto exibe evidencia corrente sem reutilizar valores de competencia anterior e sem alterar a nota.';

commit;
