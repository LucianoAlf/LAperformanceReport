begin;

alter table public.health_score_professor_v3_snapshot_metricas
  add column if not exists peso_efetivo numeric,
  add column if not exists codigo_evidencia text,
  add column if not exists papel text;

comment on column public.health_score_professor_v3_snapshot_metricas.peso_efetivo is
  'Peso normalizado entre os pilares pontuaveis e aplicaveis no snapshot.';
comment on column public.health_score_professor_v3_snapshot_metricas.codigo_evidencia is
  'Causa estruturada e legivel do estado de evidencia da metrica.';
comment on column public.health_score_professor_v3_snapshot_metricas.papel is
  'Papel da metrica no contrato vigente: nota ou diagnostico.';

create or replace function public.calcular_health_score_professor_v3_nota_diagnostica(
  p_metricas jsonb,
  p_cobertura_minima numeric,
  p_exige_pilar_fidelizacao boolean
)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_peso_disponivel numeric := 0;
  v_soma_ponderada numeric := 0;
  v_score numeric;
  v_tem_fidelizacao boolean := false;
  v_metricas jsonb := '[]'::jsonb;
  v_peso_efetivo_total numeric := 0;
begin
  if jsonb_typeof(coalesce(p_metricas, '[]'::jsonb)) <> 'array' then
    raise exception 'HEALTH_SCORE_V3_METRICAS_INVALIDAS: esperado array jsonb'
      using errcode = '22023';
  end if;

  select
    coalesce(sum((item ->> 'peso')::numeric), 0),
    coalesce(sum(
      (item ->> 'nota')::numeric * (item ->> 'peso')::numeric
    ), 0),
    coalesce(bool_or(
      item ->> 'metrica' in ('retencao', 'permanencia')
    ), false)
  into v_peso_disponivel, v_soma_ponderada, v_tem_fidelizacao
  from jsonb_array_elements(coalesce(p_metricas, '[]'::jsonb)) item
  where item ->> 'papel' = 'nota'
    and coalesce((item ->> 'peso_disponivel')::boolean, false)
    and nullif(item ->> 'nota', '') is not null;

  v_score := case
    when v_peso_disponivel > 0
      then round(v_soma_ponderada / v_peso_disponivel, 2)
    else null::numeric
  end;

  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'peso_efetivo', case
        when item ->> 'papel' = 'nota'
          and coalesce((item ->> 'peso_disponivel')::boolean, false)
          and nullif(item ->> 'nota', '') is not null
          and v_peso_disponivel > 0
          then round(
            100::numeric * (item ->> 'peso')::numeric
              / nullif(v_peso_disponivel, 0),
            4
          )
        else 0::numeric
      end
    ) order by ordinality
  ), '[]'::jsonb)
  into v_metricas
  from jsonb_array_elements(coalesce(p_metricas, '[]'::jsonb))
    with ordinality as metric(item, ordinality);

  select coalesce(sum((item ->> 'peso_efetivo')::numeric), 0)
  into v_peso_efetivo_total
  from jsonb_array_elements(v_metricas) item;

  if v_score is not null and abs(v_peso_efetivo_total - 100) > 0.01 then
    raise exception 'HEALTH_SCORE_V3_PESO_EFETIVO_INVALIDO: %',
      v_peso_efetivo_total using errcode = '22023';
  end if;

  return jsonb_build_object(
    'score', v_score,
    'cobertura', round(v_peso_disponivel, 2),
    'score_exibivel', v_score is not null,
    'ranking_elegivel',
      v_score is not null
      and v_peso_disponivel >= coalesce(p_cobertura_minima, 0)
      and (
        not coalesce(p_exige_pilar_fidelizacao, false)
        or v_tem_fidelizacao
      ),
    'tem_pilar_fidelizacao', v_tem_fidelizacao,
    'peso_efetivo_total', round(v_peso_efetivo_total, 4),
    'metricas', v_metricas
  );
end;
$function$;

revoke all on function
  public.calcular_health_score_professor_v3_nota_diagnostica(
    jsonb, numeric, boolean
  )
  from public, anon, authenticated;
grant execute on function
  public.calcular_health_score_professor_v3_nota_diagnostica(
    jsonb, numeric, boolean
  )
  to service_role;

create or replace function public.fn_health_score_professor_v3_codigo_evidencia(
  p_metrica text,
  p_estado_base text,
  p_publicavel boolean,
  p_nota numeric,
  p_amostra integer,
  p_amostra_minima integer,
  p_detalhes jsonb
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when p_metrica = 'numero_alunos' then 'diagnostico_carteira'
    when p_publicavel and p_nota is not null
      and p_metrica <> 'conversao' then 'evidencia_valida'
    when p_metrica = 'conversao' and coalesce(p_amostra, 0) = 0
      then 'sem_experimental_periodo'
    when p_metrica = 'conversao'
      and coalesce(p_amostra, 0) < coalesce(p_amostra_minima, 3)
      then 'amostra_insuficiente'
    when p_metrica = 'conversao' and p_publicavel and p_nota is not null
      then 'evidencia_valida'
    when p_estado_base = 'em_maturacao' then 'professor_em_maturacao'
    when p_metrica = 'presenca'
      and p_estado_base in ('sem_base_cobertura', 'revisar')
      then 'cobertura_presenca_insuficiente'
    when p_metrica = 'presenca'
      and coalesce((p_detalhes ->> 'aulas_elegiveis')::integer, 0) = 0
      then 'calendario_sem_aulas_elegiveis'
    when p_estado_base in (
      'regra_ausente',
      'segmentacao_incompleta',
      'divergencia_nao_ofertada'
    ) then 'segmentacao_incompleta'
    when p_estado_base in ('nao_aplicavel', 'sem_base_sem_turmas')
      then 'metrica_nao_aplicavel'
    when p_estado_base in ('fonte_indisponivel', 'bloqueada')
      then 'fonte_canonica_indisponivel'
    else 'fonte_canonica_indisponivel'
  end;
$function$;

revoke all on function
  public.fn_health_score_professor_v3_codigo_evidencia(
    text, text, boolean, numeric, integer, integer, jsonb
  )
  from public, anon, authenticated;
grant execute on function
  public.fn_health_score_professor_v3_codigo_evidencia(
    text, text, boolean, numeric, integer, integer, jsonb
  )
  to service_role;

do $do$
begin
  if to_regprocedure(
    'public.materializar_health_score_professor_v3_periodo_impl(date,text,uuid,integer)'
  ) is not null
  and to_regprocedure(
    'public.materializar_health_score_professor_v3_periodo_impl_pre_nota_diagnostica_20260802(date,text,uuid,integer)'
  ) is null then
    execute $sql$
      alter function public.materializar_health_score_professor_v3_periodo_impl(
        date, text, uuid, integer
      ) rename to
        materializar_health_score_professor_v3_periodo_impl_pre_nota_diagnostica_20260802
    $sql$;
  end if;
end;
$do$;

create or replace function public.materializar_health_score_professor_v3_periodo_impl(
  p_competencia date,
  p_periodicidade text default 'mensal',
  p_unidade_id uuid default null,
  p_professor_id integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare
  v_resultado_base jsonb;
  v_snapshot_base record;
  v_snapshot_id uuid;
  v_config public.health_score_professor_v3_config_versoes%rowtype;
  v_metricas_entrada jsonb;
  v_calculo jsonb;
  v_score numeric;
  v_cobertura numeric;
  v_classificacao text;
  v_revisao integer;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and session_user <> 'postgres' then
    raise exception 'HEALTH_SCORE_V3_ACESSO_NEGADO: materializacao interna'
      using errcode = '42501';
  end if;

  v_resultado_base :=
    public.materializar_health_score_professor_v3_periodo_impl_pre_nota_diagnostica_20260802(
      p_competencia,
      p_periodicidade,
      p_unidade_id,
      p_professor_id
    );

  for v_snapshot_base in
    select s.*
    from jsonb_array_elements_text(
      coalesce(v_resultado_base -> 'snapshot_ids', '[]'::jsonb)
    ) j(id)
    join public.health_score_professor_v3_snapshots s
      on s.id = j.id::uuid
  loop
    if v_snapshot_base.estado = 'fechado' then
      continue;
    end if;

    select * into v_config
    from public.health_score_professor_v3_config_versoes c
    where c.id = v_snapshot_base.config_id;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'metrica', sm.metrica,
        'nota', case
          when sm.metrica = 'numero_alunos' then null::numeric
          when sm.metrica = 'conversao'
            and coalesce(sm.amostra, 0) < coalesce(cm.amostra_minima, 3)
            then null::numeric
          when sm.peso_disponivel and sm.nota is not null then sm.nota
          else null::numeric
        end,
        'peso', sm.peso,
        'peso_disponivel', case
          when sm.metrica = 'numero_alunos' then false
          when sm.metrica = 'conversao' then
            sm.publicavel
            and sm.nota is not null
            and coalesce(sm.amostra, 0) >= coalesce(cm.amostra_minima, 3)
          else sm.peso_disponivel and sm.nota is not null
        end,
        'papel', case
          when sm.metrica = 'numero_alunos' then 'diagnostico'
          else 'nota'
        end,
        'codigo_evidencia',
          public.fn_health_score_professor_v3_codigo_evidencia(
            sm.metrica,
            sm.estado_base,
            sm.publicavel,
            sm.nota,
            sm.amostra,
            cm.amostra_minima,
            sm.detalhes
          )
      ) order by sm.metrica
    ), '[]'::jsonb)
    into v_metricas_entrada
    from public.health_score_professor_v3_snapshot_metricas sm
    left join public.health_score_professor_v3_config_metricas cm
      on cm.config_id = v_snapshot_base.config_id
     and cm.metrica = sm.metrica
    where sm.snapshot_id = v_snapshot_base.id;

    v_calculo := public.calcular_health_score_professor_v3_nota_diagnostica(
      v_metricas_entrada,
      v_config.cobertura_minima,
      v_config.exige_pilar_fidelizacao
    );
    v_score := (v_calculo ->> 'score')::numeric;
    v_cobertura := coalesce((v_calculo ->> 'cobertura')::numeric, 0);
    v_classificacao := case
      when v_score is null then 'sem_base'
      when v_score >= v_config.faixa_saudavel_min then 'saudavel'
      when v_score >= v_config.faixa_atencao_min then 'atencao'
      else 'critico'
    end;

    select coalesce(max(s.revisao), v_snapshot_base.revisao) + 1
    into v_revisao
    from public.health_score_professor_v3_snapshots s
    where s.professor_id = v_snapshot_base.professor_id
      and s.unidade_id is not distinct from v_snapshot_base.unidade_id
      and s.competencia = v_snapshot_base.competencia
      and s.periodicidade = v_snapshot_base.periodicidade;

    insert into public.health_score_professor_v3_snapshots (
      professor_id,
      escopo,
      unidade_id,
      competencia,
      trimestre_inicio,
      revisao,
      estado,
      config_id,
      config_versao,
      score,
      cobertura,
      classificacao,
      publicavel,
      publicado,
      motivo_bloqueio,
      regra_versao,
      snapshot_anterior_id,
      justificativa_retificacao,
      criado_por,
      periodicidade,
      periodo_inicio,
      periodo_fim,
      ciclo_codigo,
      estado_publicacao,
      score_exibivel,
      ranking_habilitado
    ) values (
      v_snapshot_base.professor_id,
      v_snapshot_base.escopo,
      v_snapshot_base.unidade_id,
      v_snapshot_base.competencia,
      v_snapshot_base.trimestre_inicio,
      v_revisao,
      'provisorio',
      v_snapshot_base.config_id,
      v_snapshot_base.config_versao,
      v_score,
      v_cobertura,
      v_classificacao,
      false,
      false,
      case
        when v_score is null then 'Nenhum pilar pontuavel possui evidencia suficiente'
        when (v_calculo ->> 'ranking_elegivel')::boolean is not true
          then 'Score parcial diagnostico; cobertura oficial ainda insuficiente'
        else 'Score parcial diagnostico; ranking depende do fechamento oficial'
      end,
      'health-score-professor-v3-nota-diagnostica-1',
      v_snapshot_base.id,
      null,
      v_snapshot_base.criado_por,
      v_snapshot_base.periodicidade,
      v_snapshot_base.periodo_inicio,
      v_snapshot_base.periodo_fim,
      v_snapshot_base.ciclo_codigo,
      case when v_score is null then 'sem_base' else 'parcial' end,
      v_score is not null,
      false
    ) returning id into v_snapshot_id;

    insert into public.health_score_professor_v3_snapshot_metricas (
      snapshot_id,
      metrica,
      valor_bruto,
      numerador,
      denominador,
      amostra,
      estado_base,
      publicavel,
      confianca,
      fonte,
      regra_versao,
      motivo_sem_base,
      detalhes,
      nota,
      peso,
      peso_disponivel,
      contribuicao,
      meta_aplicada,
      peso_efetivo,
      codigo_evidencia,
      papel
    )
    select
      v_snapshot_id,
      sm.metrica,
      sm.valor_bruto,
      sm.numerador,
      sm.denominador,
      sm.amostra,
      sm.estado_base,
      sm.publicavel,
      sm.confianca,
      sm.fonte,
      'health-score-professor-v3-nota-diagnostica-1',
      case
        when calc ->> 'codigo_evidencia' = 'evidencia_valida' then null
        else coalesce(sm.motivo_sem_base, calc ->> 'codigo_evidencia')
      end,
      coalesce(sm.detalhes, '{}'::jsonb) || jsonb_build_object(
        'papel', calc ->> 'papel',
        'peso_original', sm.peso,
        'peso_efetivo', (calc ->> 'peso_efetivo')::numeric,
        'codigo_evidencia', calc ->> 'codigo_evidencia',
        'ranking_elegivel', (v_calculo ->> 'ranking_elegivel')::boolean
      ),
      case
        when calc ->> 'papel' = 'diagnostico' then null::numeric
        when coalesce((calc ->> 'peso_disponivel')::boolean, false)
          then (calc ->> 'nota')::numeric
        else null::numeric
      end,
      sm.peso,
      coalesce((calc ->> 'peso_disponivel')::boolean, false),
      case
        when coalesce((calc ->> 'peso_disponivel')::boolean, false)
          then round(
            (calc ->> 'nota')::numeric
              * (calc ->> 'peso_efetivo')::numeric / 100,
            4
          )
        else null::numeric
      end,
      sm.meta_aplicada,
      (calc ->> 'peso_efetivo')::numeric,
      calc ->> 'codigo_evidencia',
      calc ->> 'papel'
    from public.health_score_professor_v3_snapshot_metricas sm
    join lateral jsonb_array_elements(v_calculo -> 'metricas') calc
      on calc ->> 'metrica' = sm.metrica
    where sm.snapshot_id = v_snapshot_base.id;

    insert into public.health_score_professor_v3_snapshot_metrica_segmentos (
      snapshot_metrica_id,
      config_meta_segmento_id,
      unidade_id,
      curso_id,
      modalidade,
      pessoas_unicas,
      vinculos_ativos,
      turmas_elegiveis,
      ocupacoes_unicas,
      capacidade_maxima,
      meta_aplicada,
      numerador,
      denominador,
      nota,
      estado_base,
      fonte,
      regra_versao,
      detalhes,
      atribuicao_id,
      atribuicao_formal,
      atribuicao_pontuavel,
      pessoas_unicas_total,
      pessoas_fechamentos,
      meses_com_base,
      meses_com_base_consolidado,
      meses_no_periodo,
      capacidade_excedida,
      alertas_capacidade,
      divergencias
    )
    select
      sm_new.id,
      seg.config_meta_segmento_id,
      seg.unidade_id,
      seg.curso_id,
      seg.modalidade,
      seg.pessoas_unicas,
      seg.vinculos_ativos,
      seg.turmas_elegiveis,
      seg.ocupacoes_unicas,
      seg.capacidade_maxima,
      seg.meta_aplicada,
      seg.numerador,
      seg.denominador,
      seg.nota,
      seg.estado_base,
      seg.fonte,
      seg.regra_versao,
      seg.detalhes,
      seg.atribuicao_id,
      seg.atribuicao_formal,
      seg.atribuicao_pontuavel,
      seg.pessoas_unicas_total,
      seg.pessoas_fechamentos,
      seg.meses_com_base,
      seg.meses_com_base_consolidado,
      seg.meses_no_periodo,
      seg.capacidade_excedida,
      seg.alertas_capacidade,
      seg.divergencias
    from public.health_score_professor_v3_snapshot_metrica_segmentos seg
    join public.health_score_professor_v3_snapshot_metricas sm_base
      on sm_base.id = seg.snapshot_metrica_id
    join public.health_score_professor_v3_snapshot_metricas sm_new
      on sm_new.snapshot_id = v_snapshot_id
     and sm_new.metrica = sm_base.metrica
    where sm_base.snapshot_id = v_snapshot_base.id;

    insert into public.health_score_professor_v3_snapshot_metrica_diagnosticos (
      snapshot_metrica_id,
      unidade_id,
      pessoas_unicas_total,
      dados_sem_resolucao,
      estados_resolucao,
      estado_base,
      fonte,
      regra_versao,
      divergencias,
      detalhes
    )
    select
      sm_new.id,
      d.unidade_id,
      d.pessoas_unicas_total,
      d.dados_sem_resolucao,
      d.estados_resolucao,
      d.estado_base,
      d.fonte,
      d.regra_versao,
      d.divergencias,
      d.detalhes
    from public.health_score_professor_v3_snapshot_metrica_diagnosticos d
    join public.health_score_professor_v3_snapshot_metricas sm_base
      on sm_base.id = d.snapshot_metrica_id
    join public.health_score_professor_v3_snapshot_metricas sm_new
      on sm_new.snapshot_id = v_snapshot_id
     and sm_new.metrica = sm_base.metrica
    where sm_base.snapshot_id = v_snapshot_base.id;

    update public.health_score_professor_v3_snapshots s
    set estado = case
      when v_snapshot_base.estado = 'em_maturacao' then 'em_maturacao'
      else 'provisorio'
    end
    where s.id = v_snapshot_id;

    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(v_snapshot_id);
  end loop;

  return v_resultado_base || jsonb_build_object(
    'snapshots_criados', v_count,
    'snapshot_ids', v_ids,
    'snapshots_base_intermediarios', v_resultado_base -> 'snapshot_ids',
    'regra_versao', 'health-score-professor-v3-nota-diagnostica-1',
    'consumidores_alterados', true
  );
end;
$function$;

revoke all on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  from public, anon, authenticated;
grant execute on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  )
  to service_role;

comment on function
  public.materializar_health_score_professor_v3_periodo_impl(
    date, text, uuid, integer
  ) is
  'Cria revisao append-only com carteira diagnostica, pesos efetivos e score parcial sem reescrever snapshots fechados.';

drop function if exists public.get_health_score_professor_v3_performance(
  date, uuid, text
);

create function public.get_health_score_professor_v3_performance(
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
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

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
    m.peso, m.peso_disponivel, m.peso_efetivo, m.contribuicao,
    m.meta_aplicada as meta, m.amostra, m.estado_base,
    m.publicavel as metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
    m.codigo_evidencia, m.papel,
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
$function$;

drop function if exists public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
);

create function public.get_health_score_professor_v3_snapshot_modal(
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
  papel text, detalhes jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.fn_health_score_professor_v3_ator_leitura(p_unidade_id);

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
    m.peso, m.peso_disponivel, m.peso_efetivo, m.contribuicao,
    m.meta_aplicada as meta, m.amostra, m.estado_base,
    m.publicavel as metrica_publicavel, m.confianca, m.fonte,
    m.regra_versao as regra_versao_metrica, m.motivo_sem_base,
    m.codigo_evidencia, m.papel,
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
$function$;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
revoke all on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) from public, anon;

grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;
grant execute on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Performance V3 da revisao governada com papel, evidencia e peso efetivo materializados.';
comment on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) is
  'Detalhe V3 da revisao governada com papel, evidencia e peso efetivo materializados.';

commit;
