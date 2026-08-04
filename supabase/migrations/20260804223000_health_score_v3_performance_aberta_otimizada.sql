begin;

-- A projecao aberta passou a recalcular conversao e presenca duas vezes: a
-- funcao monolitica antiga executava todos os pilares e os wrappers seguintes
-- descartavam esses dois resultados somente depois do custo ja ter ocorrido.
-- Esta versao preserva os produtores e regras vigentes, mas compoe cada pilar
-- uma unica vez.

create or replace function public.get_health_score_professor_v3_permanencia_periodo_v2(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
  amostra integer, estado_base text, publicavel boolean, confianca text,
  fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERMANENCIA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(
    v_fim_periodo,
    (v_competencia + interval '1 month - 1 day')::date,
    current_date
  );

  return query
  with unidades_permitidas as (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), periodos as (
    select pe.*
    from public.vw_professor_periodos_efetivos_v3_sombra pe
    join unidades_permitidas up on up.unidade_id = pe.unidade_id
    where pe.professor_id is not null
      and (pe.data_inicio at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
      and pe.status_periodo <> 'invalidado'
  ), elegiveis as (
    select p.*
    from periodos p
    where p.status_periodo = 'encerrado'
      and p.elegivel_permanencia
      and p.publicavel
      and p.confianca in ('alta', 'revisado_aprovado')
      and (p.data_fim at time zone 'America/Sao_Paulo')::date <= v_fim_recorte
  ), stats as (
    select e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
        as unidade_saida,
      sum(e.duracao_meses) as soma_meses,
      avg(e.duracao_meses) as media_meses,
      percentile_cont(0.5) within group (order by e.duracao_meses) as mediana_meses,
      count(*)::integer as vinculos
    from elegiveis e
    group by e.professor_id,
      case when p_unidade_id is null then null::uuid else e.unidade_id end
  ), diagnostico as (
    select p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida,
      count(*) filter (
        where p.status_periodo = 'encerrado' and not p.elegivel_permanencia
      )::integer as abaixo_quatro_meses,
      count(*) filter (
        where p.status_periodo = 'encerrado'
          and p.elegivel_permanencia
          and (not p.publicavel or p.confianca not in ('alta', 'revisado_aprovado'))
      )::integer as em_revisao,
      bool_or(p.inicio_incompleto) as historico_incompleto,
      count(*) filter (where p.status_periodo = 'ativo')::integer as ativos
    from periodos p
    group by p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
  ), alvo as (
    select distinct p.professor_id,
      case when p_unidade_id is null then null::uuid else p.unidade_id end
        as unidade_saida
    from periodos p
  )
  select
    'permanencia'::text,
    a.professor_id,
    pr.nome::text,
    a.unidade_saida,
    v_competencia,
    case when coalesce(s.vinculos, 0) > 0 then round(s.media_meses, 2) else null end,
    coalesce(s.soma_meses, 0)::numeric,
    coalesce(s.vinculos, 0)::numeric,
    coalesce(s.vinculos, 0),
    case
      when coalesce(s.vinculos, 0) = 0 then 'sem_base'
      when s.vinculos < 3 then 'sem_base_amostra'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'parcial_auditavel'
      else 'ok'
    end,
    coalesce(s.vinculos, 0) >= 3,
    case
      when coalesce(s.vinculos, 0) = 0 then 'sem_base'
      when s.vinculos < 3 then 'baixa_amostra'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'media'
      else 'alta'
    end,
    'vw_professor_periodos_efetivos_v3_sombra'::text,
    'health-score-professor-v3-permanencia-periodo-1'::text,
    case
      when coalesce(s.vinculos, 0) = 0 then 'nenhum vinculo encerrado elegivel no historico'
      when s.vinculos < 3 then 'pontuacao exige ao menos 3 vinculos encerrados elegiveis'
      when coalesce(d.em_revisao, 0) > 0 or coalesce(d.historico_incompleto, false)
        then 'valor parcial auditavel; exclusoes historicas permanecem visiveis'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'escopo_temporal', 'historico_acumulado_ate_competencia',
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'media_meses', case when coalesce(s.vinculos, 0) > 0 then round(s.media_meses, 2) end,
      'mediana_auxiliar_meses', case when coalesce(s.vinculos, 0) > 0
        then round(s.mediana_meses::numeric, 2) end,
      'vinculos_encerrados_elegiveis', coalesce(s.vinculos, 0),
      'excluidos_abaixo_quatro_meses', coalesce(d.abaixo_quatro_meses, 0),
      'vinculos_em_revisao', coalesce(d.em_revisao, 0),
      'historico_incompleto', coalesce(d.historico_incompleto, false),
      'vinculos_ativos_fora_da_media', coalesce(d.ativos, 0),
      'transparencia_exclusao',
        'vinculos menores que 4 meses permanecem no historico, fora da media',
      'apta_oficial', coalesce(s.vinculos, 0) >= 3
        and coalesce(d.em_revisao, 0) = 0
        and not coalesce(d.historico_incompleto, false)
    )
  from alvo a
  join public.professores pr on pr.id = a.professor_id
  left join stats s
    on s.professor_id = a.professor_id
   and s.unidade_saida is not distinct from a.unidade_saida
  left join diagnostico d
    on d.professor_id = a.professor_id
   and d.unidade_saida is not distinct from a.unidade_saida;
end;
$function$;

alter function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  rename to get_hs_prof_v3_metricas_periodo_before_open_perf_opt_20260804;

create or replace function public.get_health_score_professor_v3_metricas_periodo(
  p_competencia date,
  p_unidade_id uuid default null,
  p_periodicidade text default 'mensal'
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
  amostra integer, estado_base text, publicavel boolean, confianca text,
  fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_config_id uuid;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
      using errcode = '22023';
  end if;

  select c.id into v_config_id
  from public.health_score_professor_v3_config_versoes c
  where c.status = 'ativa'
    and v_competencia >= c.vigencia_inicio
    and (c.vigencia_fim is null or v_competencia <= c.vigencia_fim)
  order by c.vigencia_inicio desc, c.versao desc, c.id desc
  limit 1;

  return query
  with base as materialized (
    select
      b.metrica, b.professor_id, b.professor_nome, b.unidade_id,
      b.competencia, b.valor_bruto, b.numerador, b.denominador,
      b.amostra, b.estado_base, b.publicavel, b.confianca,
      b.fonte, b.regra_versao, b.motivo_sem_base, b.detalhes
    from public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
      p_competencia, v_config_id, p_unidade_id, p_periodicidade
    ) b
    where b.metrica in ('media_turma', 'numero_alunos')
  ), resolvida as (
    select b.*,
      case
        when b.metrica = 'media_turma'
          and b.estado_base = 'segmentacao_incompleta'
        then public.resolver_health_score_v3_media_turma_individual(
          b.detalhes, b.numerador, b.denominador
        )
        else null::jsonb
      end as resolucao_individual
    from base b
  )
  select
    r.metrica, r.professor_id, r.professor_nome, r.unidade_id,
    r.competencia, r.valor_bruto,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then (r.resolucao_individual ->> 'numerador')::numeric else r.numerador end,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then (r.resolucao_individual ->> 'denominador')::numeric else r.denominador end,
    r.amostra,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then 'ok'::text else r.estado_base end,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then true else r.publicavel end,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then 'alta_com_inferencia_individual'::text else r.confianca end,
    r.fonte,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then 'health-score-professor-v3-media-individual-canonica-1'::text
      else r.regra_versao end,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then null::text else r.motivo_sem_base end,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then coalesce(r.detalhes, '{}'::jsonb) || jsonb_build_object(
        'nota_segmentada', (r.resolucao_individual ->> 'nota')::numeric,
        'segmentos_individuais_inferidos',
          (r.resolucao_individual ->> 'segmentos_individuais_inferidos')::integer,
        'segmentos_pendentes_reais',
          (r.resolucao_individual ->> 'segmentos_pendentes')::integer,
        'regra_inferencia_individual', r.resolucao_individual ->> 'regra_inferencia'
      )
      else coalesce(r.detalhes, '{}'::jsonb) end
  from resolvida r;

  return query
  select
    'retencao'::text, r.professor_id, r.professor_nome, r.unidade_id,
    r.competencia, r.valor_bruto, r.numerador, r.denominador, r.amostra,
    r.estado_base, r.estado_base in ('ok', 'ok_com_pendencias'),
    r.confianca, r.fonte, r.regra_versao, r.motivo_sem_base, r.detalhes
  from public.get_professor_retencao_v3_governada(
    p_competencia, p_unidade_id, p_periodicidade
  ) r;

  return query
  select p.*
  from public.get_health_score_professor_v3_permanencia_periodo_v2(
    p_competencia, p_unidade_id, p_periodicidade
  ) p;

  if p_periodicidade = 'mensal' then
    return query
    select c.*
    from public.get_health_score_professor_v3_conversao_mensal(
      p_competencia, p_unidade_id
    ) c;
  else
    return query
    select c.*
    from public.get_health_score_professor_v3_conversao_ciclo(
      p_competencia, p_unidade_id
    ) c;
  end if;

  return query
  select p.*
  from public.get_health_score_professor_v3_presenca_periodo_v2(
    p_competencia, p_unidade_id, p_periodicidade
  ) p;
end;
$function$;

-- O roster ja filtra professores ativos. Este ultimo predicado tambem garante
-- que nenhuma linha de outra unidade atravesse o contrato por um professor com
-- vinculo ativo em mais de uma unidade.
alter function public.get_health_score_professor_v3_performance(date, uuid, text)
  rename to get_hs_prof_v3_performance_before_scope_fix_20260804;

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
  papel text, detalhes jsonb,
  score_observado numeric, score_comparavel numeric,
  pilares_validos integer, pilares_esperados integer,
  comparabilidade_estado text, comparabilidade_motivo text,
  competencia_referencia date, score_referencia numeric,
  classificacao_referencia text,
  data_corte date, config_id uuid, regra_fingerprint text,
  peso_pontuavel_total numeric, peso_disponivel_total numeric,
  cobertura_normalizada numeric, cobertura_minima_aplicada numeric,
  comparabilidade_motivos jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select b.*
  from public.get_hs_prof_v3_performance_before_scope_fix_20260804(
    p_competencia, p_unidade_id, p_periodicidade
  ) b
  where (
    p_unidade_id is null
    or b.unidade_id is not distinct from p_unidade_id
  );
$function$;

revoke all on function public.get_health_score_professor_v3_permanencia_periodo_v2(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_permanencia_periodo_v2(
  date, uuid, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) to authenticated, service_role;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) is
  'Produtor V3 aberto otimizado: compoe segmentos, retencao, permanencia, conversao e presenca uma unica vez, preservando as regras canonicas vigentes.';

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Read model V3 compacto e restrito a unidade solicitada; a projecao aberta usa produtores canonicos sem recalculo redundante.';

commit;
