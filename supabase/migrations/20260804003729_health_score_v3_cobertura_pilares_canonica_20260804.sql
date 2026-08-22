-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin;

-- Comparabilidade mede quantos pilares possuem evidencia valida. Os pesos
-- continuam governando a composicao da nota, mas nao podem transformar
-- 3 de 5 pilares em 55,6% apenas porque os tres pilares disponiveis pesam 50/90.
create or replace function public.calcular_health_score_professor_v3_cobertura_pilares(
  p_pilares_validos integer,
  p_pilares_esperados integer
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when coalesce(p_pilares_esperados, 0) <= 0 then 0::numeric
    else round(
      greatest(0::numeric, coalesce(p_pilares_validos, 0)::numeric)
        / nullif(p_pilares_esperados, 0) * 100,
      1
    )
  end;
$function$;

-- Modalidade individual tem referencia operacional invariavel de uma pessoa
-- por turma. A jornada observada comprova o vinculo professor/curso; a falta de
-- uma atribuicao manual duplicada nao deve apagar esse pilar. Outros segmentos
-- pendentes continuam bloqueando a metrica e permanecem visiveis no diagnostico.
create or replace function public.resolver_health_score_v3_media_turma_individual(
  p_detalhes jsonb,
  p_numerador_configurado numeric,
  p_denominador_configurado numeric
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $function$
  with unidades as (
    select u.value
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(p_detalhes, '{}'::jsonb) -> 'segmentos_resumo') = 'array'
          then coalesce(p_detalhes, '{}'::jsonb) -> 'segmentos_resumo'
        else '[]'::jsonb
      end
    ) u
  ), segmentos as (
    select s.value as segmento
    from unidades u
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(u.value) = 'array'
        then u.value else jsonb_build_array(u.value) end
    ) s
    where jsonb_typeof(s.value) = 'object'
  ), classificados as (
    select
      segmento,
      coalesce(nullif(segmento ->> 'turmas_elegiveis', '')::integer, 0) as turmas,
      coalesce(nullif(segmento ->> 'ocupacoes_unicas', '')::numeric, 0) as ocupacoes,
      lower(coalesce(segmento ->> 'modalidade', '')) = 'individual'
        and coalesce(nullif(segmento ->> 'turmas_elegiveis', '')::integer, 0) > 0
        and coalesce(segmento ->> 'estado_base', '') <> 'ok' as individual_inferivel,
      coalesce(segmento ->> 'estado_base', '') in (
        'regra_ausente', 'segmentacao_incompleta', 'divergencia_nao_ofertada'
      )
        and coalesce(nullif(segmento ->> 'turmas_elegiveis', '')::integer, 0) > 0
        and lower(coalesce(segmento ->> 'modalidade', '')) <> 'individual'
        as pendente_real
    from segmentos
  ), totais as (
    select
      coalesce(sum(ocupacoes) filter (where individual_inferivel), 0)::numeric
        as ocupacoes_individuais,
      coalesce(sum(turmas) filter (where individual_inferivel), 0)::numeric
        as turmas_individuais,
      count(*) filter (where individual_inferivel)::integer
        as segmentos_individuais_inferidos,
      count(*) filter (where pendente_real)::integer as segmentos_pendentes
    from classificados
  ), resolvido as (
    select
      greatest(0::numeric, coalesce(p_numerador_configurado, 0))
        + ocupacoes_individuais as numerador,
      greatest(0::numeric, coalesce(p_denominador_configurado, 0))
        + turmas_individuais as denominador,
      segmentos_individuais_inferidos,
      segmentos_pendentes
    from totais
  )
  select jsonb_build_object(
    'resolvido', segmentos_pendentes = 0 and denominador > 0,
    'numerador', numerador,
    'denominador', denominador,
    'nota', case when segmentos_pendentes = 0 and denominador > 0
      then round(least(100::numeric, 100::numeric * numerador / denominador), 2)
      else null::numeric end,
    'segmentos_individuais_inferidos', segmentos_individuais_inferidos,
    'segmentos_pendentes', segmentos_pendentes,
    'regra_inferencia', 'modalidade_individual_meta_1'
  )
  from resolvido;
$function$;

alter function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  rename to get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803;

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
as $function$
  with base as materialized (
    select b.*
    from public.get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803(
      p_competencia, p_unidade_id, p_periodicidade
    ) b
  ), resolvida as (
    select
      b.*,
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
    r.metrica,
    r.professor_id,
    r.professor_nome,
    r.unidade_id,
    r.competencia,
    r.valor_bruto,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then (r.resolucao_individual ->> 'numerador')::numeric
      else r.numerador end,
    case when coalesce((r.resolucao_individual ->> 'resolvido')::boolean, false)
      then (r.resolucao_individual ->> 'denominador')::numeric
      else r.denominador end,
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
$function$;

alter function public.get_health_score_professor_v3_performance(date, uuid, text)
  rename to get_hs_prof_v3_performance_before_pillar_coverage_20260803;

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
  with base as materialized (
    select b.*
    from public.get_hs_prof_v3_performance_before_pillar_coverage_20260803(
      p_competencia, p_unidade_id, p_periodicidade
    ) b
  ), resumo as (
    select
      b.professor_id,
      (array_agg(b.config_id) filter (where b.config_id is not null))[1] as config_id,
      max(b.score_observado) as score_observado,
      max(b.pilares_validos) as pilares_validos,
      max(b.pilares_esperados) as pilares_esperados,
      max(b.peso_pontuavel_total) as peso_pontuavel_total,
      max(b.peso_disponivel_total) as peso_disponivel_total,
      max(b.cobertura_normalizada) as cobertura_ponderada_diagnostica,
      coalesce(bool_or(
        b.metrica in ('retencao', 'permanencia')
          and coalesce(b.peso_disponivel, false)
          and b.nota is not null
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        coalesce(b.codigo_evidencia, '') = 'fonte_canonica_indisponivel'
          and nullif(b.detalhes ->> 'motivo_auditoria', '') is not null
      ), false) as fonte_canonica_disponivel
    from base b
    group by b.professor_id
  ), criterios as (
    select
      r.*,
      c.cobertura_minima,
      c.pilares_minimos,
      c.faixa_atencao_min,
      c.faixa_saudavel_min,
      public.calcular_health_score_professor_v3_cobertura_pilares(
        r.pilares_validos, r.pilares_esperados
      ) as cobertura_pilares,
      public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(c.id)
        as fingerprint_atual
    from resumo r
    left join public.health_score_professor_v3_config_versoes c on c.id = r.config_id
  ), avaliados as (
    select
      c.*,
      public.avaliar_health_score_professor_v3_comparabilidade(
        c.score_observado,
        c.cobertura_pilares,
        c.pilares_validos,
        c.tem_fidelizacao,
        coalesce(c.cobertura_minima, 60),
        coalesce(c.pilares_minimos, 3),
        c.fonte_canonica_disponivel
      ) as avaliacao
    from criterios c
  )
  select
    b.professor_id, b.unidade_id, b.escopo, b.competencia,
    b.trimestre_inicio, b.periodicidade, b.periodo_inicio, b.periodo_fim,
    b.ciclo_codigo, b.estado_publicacao, b.score_exibivel,
    b.ranking_habilitado, b.config_versao, b.revisao, b.score,
    a.cobertura_pilares,
    case
      when (a.avaliacao ->> 'estado') <> 'comparavel' then null::text
      when b.score_observado >= a.faixa_saudavel_min then 'saudavel'
      when b.score_observado >= a.faixa_atencao_min then 'atencao'
      else 'critico'
    end,
    b.estado, b.snapshot_publicavel, b.publicado, b.motivo_bloqueio,
    b.regra_versao_snapshot,
    b.metrica, b.valor_bruto, b.numerador, b.denominador,
    b.nota, b.peso, b.peso_disponivel, b.peso_efetivo,
    b.contribuicao, b.meta, b.amostra, b.estado_base,
    b.metrica_publicavel, b.confianca, b.fonte,
    b.regra_versao_metrica, b.motivo_sem_base, b.codigo_evidencia,
    b.papel,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'cobertura_normalizada', a.cobertura_pilares,
      'cobertura_por_pilares', a.cobertura_pilares,
      'cobertura_ponderada_diagnostica', a.cobertura_ponderada_diagnostica,
      'comparabilidade_motivos', a.avaliacao -> 'motivos',
      'regra_cobertura', 'quantidade_pilares_validos'
    ),
    b.score_observado,
    case when (a.avaliacao ->> 'estado') = 'comparavel'
      then b.score_observado else null::numeric end,
    b.pilares_validos, b.pilares_esperados,
    a.avaliacao ->> 'estado', a.avaliacao ->> 'motivo',
    b.competencia_referencia, b.score_referencia,
    b.classificacao_referencia,
    b.data_corte, b.config_id, coalesce(a.fingerprint_atual, b.regra_fingerprint),
    b.peso_pontuavel_total, b.peso_disponivel_total,
    a.cobertura_pilares, coalesce(a.cobertura_minima, 60),
    a.avaliacao -> 'motivos'
  from base b
  join avaliados a on a.professor_id = b.professor_id;
$function$;

revoke all on function public.calcular_health_score_professor_v3_cobertura_pilares(
  integer, integer
) from public, anon;
grant execute on function public.calcular_health_score_professor_v3_cobertura_pilares(
  integer, integer
) to authenticated, service_role;

revoke all on function public.resolver_health_score_v3_media_turma_individual(
  jsonb, numeric, numeric
) from public, anon;
grant execute on function public.resolver_health_score_v3_media_turma_individual(
  jsonb, numeric, numeric
) to authenticated, service_role;

revoke all on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) to authenticated, service_role;

revoke all on function public.get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_metricas_periodo_before_individual_fix_20260803(
  date, uuid, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

revoke all on function public.get_hs_prof_v3_performance_before_pillar_coverage_20260803(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_hs_prof_v3_performance_before_pillar_coverage_20260803(
  date, uuid, text
) to service_role;

comment on function public.calcular_health_score_professor_v3_cobertura_pilares(
  integer, integer
) is 'Cobertura de comparabilidade: pilares validos / pilares esperados. Pesos permanecem exclusivos da composicao da nota.';

comment on function public.resolver_health_score_v3_media_turma_individual(
  jsonb, numeric, numeric
) is 'Resolve apenas segmentos individuais observados com referencia invariavel de uma pessoa por turma; pendencias reais de turma continuam bloqueando.';

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is 'Read model V3: comparabilidade usa quantidade de pilares; cobertura ponderada fica somente no diagnostico.';

commit;
