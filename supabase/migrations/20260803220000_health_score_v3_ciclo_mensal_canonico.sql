begin;

-- Health Score Professor V3: leitura mensal e ciclo fixo usam o mesmo produtor
-- canonico. O score observado continua visivel, mas comparabilidade e ranking
-- dependem da cobertura normalizada dos pilares que realmente pontuam.

create or replace function public.calcular_health_score_professor_v3_cobertura_normalizada(
  p_peso_disponivel_total numeric,
  p_peso_pontuavel_total numeric
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when coalesce(p_peso_pontuavel_total, 0) <= 0 then 0::numeric
    else round(
      greatest(0::numeric, coalesce(p_peso_disponivel_total, 0))
        / nullif(p_peso_pontuavel_total, 0) * 100,
      1
    )
  end;
$function$;

create or replace function public.avaliar_health_score_professor_v3_comparabilidade(
  p_score_observado numeric,
  p_cobertura numeric,
  p_pilares_validos integer,
  p_tem_fidelizacao boolean,
  p_cobertura_minima numeric,
  p_fonte_canonica_disponivel boolean default true
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_estado text;
  v_motivo text;
  v_comparavel boolean := false;
  v_motivos jsonb := '[]'::jsonb;
begin
  if coalesce(p_pilares_validos, 0) = 0 then
    v_motivos := v_motivos || '"sem_pilares_validos"'::jsonb;
  elsif p_pilares_validos < 3 then
    v_motivos := v_motivos || '"pilares_insuficientes"'::jsonb;
  end if;

  if p_score_observado is null then
    v_motivos := v_motivos || '"score_observado_indisponivel"'::jsonb;
  end if;
  if coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_motivos := v_motivos || '"cobertura_insuficiente"'::jsonb;
  end if;
  if not coalesce(p_tem_fidelizacao, false) then
    v_motivos := v_motivos || '"sem_pilar_fidelizacao"'::jsonb;
  end if;
  if not coalesce(p_fonte_canonica_disponivel, false) then
    v_motivos := v_motivos || '"fonte_canonica_indisponivel"'::jsonb;
  end if;

  if coalesce(p_pilares_validos, 0) = 0 then
    v_estado := 'sem_base_operacional';
    v_motivo := 'sem_pilares_validos';
  elsif not coalesce(p_fonte_canonica_disponivel, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'fonte_em_auditoria';
  elsif p_score_observado is null then
    v_estado := 'em_maturacao';
    v_motivo := 'score_observado_indisponivel';
  elsif p_pilares_validos < 3 then
    v_estado := 'em_maturacao';
    v_motivo := 'pilares_insuficientes';
  elsif coalesce(p_cobertura, 0) < coalesce(p_cobertura_minima, 60) then
    v_estado := 'em_maturacao';
    v_motivo := 'cobertura_insuficiente';
  elsif not coalesce(p_tem_fidelizacao, false) then
    v_estado := 'em_maturacao';
    v_motivo := 'sem_pilar_fidelizacao';
  else
    v_estado := 'comparavel';
    v_motivo := 'criterios_atendidos';
    v_comparavel := true;
    v_motivos := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'estado', v_estado,
    'motivo', v_motivo,
    'motivos', v_motivos,
    'comparavel', v_comparavel,
    'score_comparavel', case when v_comparavel then p_score_observado else null end
  );
end;
$function$;

-- A implementacao de 28/07 permanece auditavel e fornece os fatos brutos.
alter function public.get_health_score_professor_v3_metricas_periodo(date, uuid, text)
  rename to get_hs_prof_v3_metricas_periodo_base_20260803;

alter function public.get_health_score_professor_v3_conversao_ciclo(date, uuid)
  rename to get_hs_prof_v3_conversao_ciclo_base_20260803;

create or replace function public.get_health_score_professor_v3_conversao_mensal(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
  amostra integer, estado_base text, publicavel boolean, confianca text,
  fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    b.metrica, b.professor_id, b.professor_nome, b.unidade_id,
    date_trunc('month', p_competencia)::date, b.valor_bruto,
    b.numerador, b.denominador, b.amostra,
    case
      when coalesce(b.denominador, 0) = 0 then 'sem_base'
      when coalesce(b.amostra, 0) < 3 then 'sem_base_amostra'
      else b.estado_base
    end,
    b.publicavel, b.confianca, b.fonte,
    'health-score-professor-v3-conversao-mensal-1'::text,
    case
      when coalesce(b.denominador, 0) = 0 then 'nenhuma experimental confirmada no mes'
      when coalesce(b.amostra, 0) < 3 then 'amostra minima de 3 experimentais nao atingida'
      else b.motivo_sem_base
    end,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'periodicidade', 'mensal',
      'codigo_evidencia', case
        when coalesce(b.denominador, 0) = 0 then 'sem_experimental_mes'
        when coalesce(b.amostra, 0) < 3 then 'amostra_experimental_insuficiente'
        else 'evidencia_mensal_disponivel'
      end,
      'fora_do_score', false
    )
  from public.get_health_score_prof_v3_metricas_base_20260728(
    date_trunc('month', p_competencia)::date,
    p_unidade_id,
    'mensal'
  ) b
  where b.metrica = 'conversao';
$function$;

create or replace function public.get_health_score_professor_v3_conversao_ciclo(
  p_competencia date,
  p_unidade_id uuid default null
)
returns table (
  metrica text, professor_id integer, professor_nome text, unidade_id uuid,
  competencia date, valor_bruto numeric, numerador numeric, denominador numeric,
  amostra integer, estado_base text, publicavel boolean, confianca text,
  fonte text, regra_versao text, motivo_sem_base text, detalhes jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with periodo as (
    select p.*
    from public.fn_health_score_v3_periodo(p_competencia, 'ciclo') p
  )
  select
    b.metrica, b.professor_id, b.professor_nome, b.unidade_id,
    date_trunc('month', p_competencia)::date, b.valor_bruto,
    b.numerador, b.denominador, b.amostra,
    case
      when coalesce(b.denominador, 0) = 0 then 'sem_base'
      when coalesce(b.amostra, 0) < 3 then 'sem_base_amostra'
      when current_date <= p.periodo_fim + 30 then 'em_andamento'
      else 'ok'
    end,
    coalesce(b.denominador, 0) >= 3,
    case
      when coalesce(b.denominador, 0) = 0 then 'sem_base'
      when coalesce(b.amostra, 0) < 3 then 'baixa'
      when current_date <= p.periodo_fim + 30 then 'provisoria'
      else 'alta'
    end,
    b.fonte,
    'health-score-professor-v3-conversao-ciclo-canonico-1'::text,
    case
      when coalesce(b.denominador, 0) = 0 then 'nenhuma experimental confirmada no ciclo'
      when coalesce(b.amostra, 0) < 3 then 'amostra minima de 3 experimentais nao atingida no ciclo'
      when current_date <= p.periodo_fim + 30 then 'ciclo em acompanhamento; janela D+30 aberta'
      else null::text
    end,
    coalesce(b.detalhes, '{}'::jsonb) - 'provisorio_ciclo' || jsonb_build_object(
      'periodicidade', 'ciclo',
      'periodo_inicio', p.periodo_inicio,
      'periodo_fim', p.periodo_fim,
      'ciclo_codigo', p.ciclo_codigo,
      'codigo_evidencia', case
        when coalesce(b.denominador, 0) = 0 then 'sem_experimental_ciclo'
        when coalesce(b.amostra, 0) < 3 then 'amostra_experimental_insuficiente'
        else 'evidencia_ciclo_disponivel'
      end,
      'fora_do_score', false
    )
  from public.get_hs_prof_v3_conversao_ciclo_base_20260803(
    p_competencia,
    p_unidade_id
  ) b
  cross join periodo p;
$function$;

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
begin
  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_hs_prof_v3_metricas_periodo_base_20260803(
      p_competencia, p_unidade_id, 'mensal'
    ) b
    where b.metrica <> 'conversao'
    union all
    select c.*
    from public.get_health_score_professor_v3_conversao_mensal(
      p_competencia, p_unidade_id
    ) c;
    return;
  elsif p_periodicidade = 'ciclo' then
    return query
    select b.*
    from public.get_hs_prof_v3_metricas_periodo_base_20260803(
      p_competencia, p_unidade_id, 'ciclo'
    ) b
    where b.metrica <> 'conversao'
    union all
    select c.*
    from public.get_health_score_professor_v3_conversao_ciclo(
      p_competencia, p_unidade_id
    ) c;
    return;
  end if;

  raise exception 'HEALTH_SCORE_V3_PERIODICIDADE_INVALIDA: use mensal ou ciclo'
    using errcode = '22023';
end;
$function$;

-- A projecao mensal vigente fica intacta. O ramo de ciclo monta a mesma grade
-- de fatos, usando numeradores e denominadores do ciclo antes de normalizar.
alter function public.get_health_score_professor_v3_projecao_viva(date, uuid, text)
  rename to get_hs_prof_v3_projecao_viva_base_20260803;

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
  segmentadas as (
    select s.*
    from configuracao c
    cross join lateral public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
      p_competencia, c.id, p_unidade_id, 'ciclo'
    ) s
  ),
  preparadas as (
    select
      b.*,
      c.id as config_id,
      c.versao as config_versao_atual,
      cm.peso,
      cm.meta,
      cm.amostra_minima,
      case when b.metrica in ('media_turma', 'numero_alunos')
        then coalesce(s.valor_bruto, b.valor_bruto) else b.valor_bruto end as valor_resolvido,
      case when b.metrica in ('media_turma', 'numero_alunos')
        then coalesce(s.numerador, b.numerador) else b.numerador end as numerador_resolvido,
      case when b.metrica in ('media_turma', 'numero_alunos')
        then coalesce(s.denominador, b.denominador) else b.denominador end as denominador_resolvido,
      case when b.metrica in ('media_turma', 'numero_alunos')
        then coalesce(s.amostra, b.amostra) else b.amostra end as amostra_resolvida,
      case when b.metrica = 'media_turma' then s.nota else null::numeric end as nota_segmentada,
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
    left join segmentadas s
      on s.professor_id = b.professor_id
     and s.unidade_id is not distinct from b.unidade_id
     and s.metrica = b.metrica
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
    'health-score-professor-v3-ciclo-vivo-1'::text,
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
    'health-score-professor-v3-ciclo-vivo-1'::text,
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

-- O read model de comparabilidade existente continua responsavel por preservar
-- snapshots e referencias. Este adaptador injeta o ciclo vivo antes dele.
alter function public.get_health_score_professor_v3_performance_base_comparabilidade(
  date, uuid, text
) rename to get_hs_prof_v3_performance_base_comp_legacy_20260803;

create or replace function public.get_health_score_professor_v3_performance_base_comparabilidade(
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
  v_periodo record;
  v_total_linhas bigint := 0;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PERFORMANCE_INVALIDO: competencia e periodicidade obrigatorias'
      using errcode = '22023';
  end if;

  if p_periodicidade = 'mensal' then
    return query
    select b.*
    from public.get_hs_prof_v3_performance_base_comp_legacy_20260803(
      p_competencia, p_unidade_id, 'mensal'
    ) b;
    return;
  end if;

  select p.* into v_periodo
  from public.fn_health_score_v3_periodo(p_competencia, 'ciclo') p;

  if exists (
    select 1
    from public.health_score_professor_v3_snapshots s
    where s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = 'ciclo'
      and s.periodo_inicio = v_periodo.periodo_inicio
      and s.periodo_fim = v_periodo.periodo_fim
      and s.ciclo_codigo = v_periodo.ciclo_codigo
      and s.estado_publicacao = 'oficial'
      and s.invalidado_em is null
  ) then
    return query
    with candidatos as (
      select s.*, row_number() over (
        partition by s.professor_id
        order by s.revisao desc, s.criado_em desc, s.id desc
      ) as rn
      from public.health_score_professor_v3_snapshots s
      where s.unidade_id is not distinct from p_unidade_id
        and s.periodicidade = 'ciclo'
        and s.periodo_inicio = v_periodo.periodo_inicio
        and s.periodo_fim = v_periodo.periodo_fim
        and s.ciclo_codigo = v_periodo.ciclo_codigo
        and s.estado_publicacao = 'oficial'
        and s.invalidado_em is null
    )
    select
      s.professor_id, s.unidade_id, s.escopo, s.competencia,
      s.trimestre_inicio, s.periodicidade, s.periodo_inicio, s.periodo_fim,
      s.ciclo_codigo, s.estado_publicacao, s.score_exibivel,
      s.ranking_habilitado, s.config_versao, s.revisao, s.score,
      s.cobertura, s.classificacao, s.estado,
      s.publicavel, s.publicado, s.motivo_bloqueio, s.regra_versao,
      sm.metrica, sm.valor_bruto, sm.numerador, sm.denominador, sm.nota,
      sm.peso, sm.peso_disponivel, sm.peso_efetivo, sm.contribuicao,
      sm.meta_aplicada, sm.amostra, sm.estado_base, sm.publicavel, sm.confianca,
      sm.fonte, sm.regra_versao, sm.motivo_sem_base, sm.codigo_evidencia,
      sm.papel, coalesce(sm.detalhes, '{}'::jsonb)
    from candidatos s
    join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
    where s.rn = 1;
    return;
  end if;

  return query
  select p.*
  from public.get_health_score_professor_v3_projecao_viva_coerente(
    p_competencia, p_unidade_id, 'ciclo'
  ) p;

  get diagnostics v_total_linhas = row_count;
  if v_total_linhas = 0 then
    raise exception 'HEALTH_SCORE_V3_CICLO_INDISPONIVEL: produtor canonico sem linhas para %',
      v_periodo.ciclo_codigo using errcode = '55000';
  end if;
end;
$function$;

-- O contrato publico ganha os totais brutos e a cobertura normalizada. O
-- wrapper legado e preservado para manter toda a referencia historica vigente.
alter function public.get_health_score_professor_v3_performance(date, uuid, text)
  rename to get_hs_prof_v3_performance_comp_legacy_20260803;

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
    from public.get_hs_prof_v3_performance_comp_legacy_20260803(
      p_competencia, p_unidade_id, p_periodicidade
    ) b
  ),
  resumo as (
    select
      b.professor_id,
      max(b.config_versao) as config_versao,
      max(b.score_observado) as score_observado,
      sum(coalesce(b.peso, 0)) filter (
        where b.papel = 'nota' and coalesce(b.peso, 0) > 0
      ) as peso_pontuavel_total,
      sum(coalesce(b.peso, 0)) filter (
        where b.papel = 'nota'
          and coalesce(b.peso, 0) > 0
          and coalesce(b.peso_disponivel, false)
          and b.nota is not null
      ) as peso_disponivel_total,
      count(distinct b.metrica) filter (
        where b.papel = 'nota'
          and coalesce(b.peso_disponivel, false)
          and b.nota is not null
      )::integer as pilares_validos,
      count(distinct b.metrica) filter (
        where b.papel = 'nota' and coalesce(b.peso, 0) > 0
      )::integer as pilares_esperados,
      coalesce(bool_or(
        b.metrica in ('retencao', 'permanencia')
          and coalesce(b.peso_disponivel, false)
          and b.nota is not null
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        b.papel = 'nota'
          and coalesce(b.peso_disponivel, false)
          and b.nota is not null
          and coalesce(b.codigo_evidencia, '') = 'fonte_canonica_indisponivel'
          and nullif(b.detalhes ->> 'motivo_auditoria', '') is not null
      ), false) as fonte_canonica_disponivel
    from base b
    group by b.professor_id
  ),
  avaliados as (
    select
      r.*,
      c.id as config_id,
      c.cobertura_minima,
      c.pilares_minimos,
      c.exige_pilar_fidelizacao,
      c.faixa_atencao_min,
      c.faixa_saudavel_min,
      public.fn_health_score_professor_v3_config_fingerprint_comparabilidade(c.id)
        as regra_fingerprint,
      public.calcular_health_score_professor_v3_cobertura_normalizada(
        r.peso_disponivel_total,
        r.peso_pontuavel_total
      ) as cobertura_normalizada,
      public.avaliar_health_score_professor_v3_comparabilidade(
        r.score_observado,
        public.calcular_health_score_professor_v3_cobertura_normalizada(
          r.peso_disponivel_total,
          r.peso_pontuavel_total
        ),
        r.pilares_validos,
        r.tem_fidelizacao,
        coalesce(c.cobertura_minima, 60),
        coalesce(c.pilares_minimos, 3),
        r.fonte_canonica_disponivel
      ) as avaliacao
    from resumo r
    left join public.health_score_professor_v3_config_versoes c
      on c.versao = r.config_versao
  )
  select
    b.professor_id, b.unidade_id, b.escopo, b.competencia,
    b.trimestre_inicio, b.periodicidade, b.periodo_inicio, b.periodo_fim,
    b.ciclo_codigo,
    case when p_periodicidade = 'ciclo' and current_date <= b.periodo_fim
      then 'ciclo_em_acompanhamento' else b.estado_publicacao end,
    b.score_observado is not null,
    b.ranking_habilitado
      and b.estado_publicacao = 'oficial'
      and (a.avaliacao ->> 'estado') = 'comparavel',
    b.config_versao, b.revisao, b.score_observado,
    a.cobertura_normalizada,
    case
      when (a.avaliacao ->> 'estado') <> 'comparavel' then null::text
      when b.score_observado >= a.faixa_saudavel_min then 'saudavel'
      when b.score_observado >= a.faixa_atencao_min then 'atencao'
      else 'critico'
    end,
    b.estado, b.snapshot_publicavel, b.publicado, b.motivo_bloqueio,
    b.regra_versao_snapshot, b.metrica, b.valor_bruto, b.numerador,
    b.denominador, b.nota, b.peso, b.peso_disponivel, b.peso_efetivo,
    b.contribuicao, b.meta, b.amostra, b.estado_base, b.metrica_publicavel,
    b.confianca, b.fonte, b.regra_versao_metrica, b.motivo_sem_base,
    b.codigo_evidencia, b.papel,
    coalesce(b.detalhes, '{}'::jsonb) || jsonb_build_object(
      'peso_pontuavel_total', a.peso_pontuavel_total,
      'peso_disponivel_total', a.peso_disponivel_total,
      'cobertura_normalizada', a.cobertura_normalizada,
      'cobertura_minima_aplicada', a.cobertura_minima,
      'comparabilidade_motivos', a.avaliacao -> 'motivos',
      'pilares_minimos_aplicado', a.pilares_minimos,
      'exige_pilar_fidelizacao', a.exige_pilar_fidelizacao,
      'config_id', a.config_id,
      'regra_fingerprint', a.regra_fingerprint
    ),
    b.score_observado,
    case when (a.avaliacao ->> 'estado') = 'comparavel'
      then b.score_observado else null::numeric end,
    a.pilares_validos, a.pilares_esperados,
    a.avaliacao ->> 'estado', a.avaliacao ->> 'motivo',
    b.competencia_referencia, b.score_referencia, b.classificacao_referencia,
    least(current_date, b.periodo_fim),
    a.config_id, a.regra_fingerprint,
    a.peso_pontuavel_total, a.peso_disponivel_total,
    a.cobertura_normalizada, a.cobertura_minima,
    a.avaliacao -> 'motivos'
  from base b
  join avaliados a on a.professor_id = b.professor_id
  order by b.professor_id, case b.metrica
    when 'retencao' then 1 when 'permanencia' then 2 when 'conversao' then 3
    when 'media_turma' then 4 when 'numero_alunos' then 5 when 'presenca' then 6
    else 99 end;
$function$;

alter function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) rename to get_hs_prof_v3_snapshot_modal_legacy_20260803;

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
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_professor_id is null then
    raise exception 'HEALTH_SCORE_V3_MODAL_INVALIDO: professor obrigatorio'
      using errcode = '22023';
  end if;

  return query
  select p.*
  from public.get_health_score_professor_v3_performance(
    p_competencia, p_unidade_id, p_periodicidade
  ) p
  where p.professor_id = p_professor_id;
end;
$function$;

revoke all on function public.calcular_health_score_professor_v3_cobertura_normalizada(
  numeric, numeric
) from public, anon;
grant execute on function public.calcular_health_score_professor_v3_cobertura_normalizada(
  numeric, numeric
) to authenticated, service_role;

revoke all on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, boolean
) from public, anon, authenticated;
grant execute on function public.avaliar_health_score_professor_v3_comparabilidade(
  numeric, numeric, integer, boolean, numeric, boolean
) to service_role;

revoke all on function public.get_hs_prof_v3_metricas_periodo_base_20260803(
  date, uuid, text
) from public, anon, authenticated;
revoke all on function public.get_hs_prof_v3_conversao_ciclo_base_20260803(
  date, uuid
) from public, anon, authenticated;
revoke all on function public.get_hs_prof_v3_projecao_viva_base_20260803(
  date, uuid, text
) from public, anon, authenticated;
revoke all on function public.get_hs_prof_v3_performance_base_comp_legacy_20260803(
  date, uuid, text
) from public, anon, authenticated;
revoke all on function public.get_hs_prof_v3_performance_comp_legacy_20260803(
  date, uuid, text
) from public, anon, authenticated;

grant execute on function public.get_hs_prof_v3_metricas_periodo_base_20260803(
  date, uuid, text
) to service_role;
grant execute on function public.get_hs_prof_v3_conversao_ciclo_base_20260803(
  date, uuid
) to service_role;
grant execute on function public.get_hs_prof_v3_projecao_viva_base_20260803(
  date, uuid, text
) to service_role;
grant execute on function public.get_hs_prof_v3_performance_base_comp_legacy_20260803(
  date, uuid, text
) to service_role;
grant execute on function public.get_hs_prof_v3_performance_comp_legacy_20260803(
  date, uuid, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_conversao_mensal(
  date, uuid
) from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_conversao_ciclo(
  date, uuid
) from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) from public, anon;
revoke all on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_performance_base_comparabilidade(
  date, uuid, text
) from public, anon, authenticated;
revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;

grant execute on function public.get_health_score_professor_v3_conversao_mensal(
  date, uuid
) to service_role;
grant execute on function public.get_health_score_professor_v3_conversao_ciclo(
  date, uuid
) to service_role;
grant execute on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) to service_role;
grant execute on function public.get_health_score_professor_v3_performance_base_comparabilidade(
  date, uuid, text
) to service_role;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_metricas_periodo(
  date, uuid, text
) is 'Produtor canonico: mensal usa somente o mes; ciclo agrega fatos brutos do ciclo fixo.';

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is 'Read model mensal/ciclo com score observado, cobertura normalizada, comparabilidade e snapshot oficial imutavel.';

commit;
