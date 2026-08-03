begin;

create or replace function public.normalizar_health_score_professor_v3_meta_viva(
  p_metrica text,
  p_valor_bruto numeric,
  p_meta numeric,
  p_nota_segmentada numeric default null
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when p_metrica = 'numero_alunos' then null::numeric
    when p_metrica = 'media_turma' then
      case
        when p_nota_segmentada is null then null::numeric
        else round(least(100::numeric, greatest(0::numeric, p_nota_segmentada)), 2)
      end
    when p_metrica in ('retencao', 'permanencia', 'conversao', 'presenca') then
      case
        when p_valor_bruto is null or coalesce(p_meta, 0) <= 0 then null::numeric
        else round(least(100::numeric, greatest(
          0::numeric,
          p_valor_bruto / nullif(p_meta, 0) * 100
        )), 2)
      end
    else null::numeric
  end;
$function$;

comment on function public.normalizar_health_score_professor_v3_meta_viva(
  text, numeric, numeric, numeric
) is
  'Normaliza pilares pontuaveis pela meta versionada. Carteira permanece diagnostica e media de turma preserva a nota segmentada.';

create or replace function public.get_health_score_professor_v3_projecao_viva_coerente(
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
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with parametros as (
    select date_trunc('month', p_competencia)::date as competencia
  ),
  configuracao as (
    select c.*
    from public.health_score_professor_v3_config_versoes c
    cross join parametros p
    where c.status = 'ativa'
      and c.vigencia_inicio <= p.competencia
      and (c.vigencia_fim is null or c.vigencia_fim >= p.competencia)
    order by c.vigencia_inicio desc, c.versao desc, c.id desc
    limit 1
  ),
  base as (
    select v.*
    from public.get_health_score_professor_v3_projecao_viva(
      p_competencia,
      p_unidade_id,
      p_periodicidade
    ) v
  ),
  score_referencia_ordenado as (
    select
      s.professor_id,
      s.competencia as competencia_referencia,
      s.score as score_referencia,
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
    cross join parametros p
    where s.competencia < p.competencia
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
      and s.invalidado_em is null
      and s.score is not null
  ),
  score_referencia as (
    select r.professor_id, r.competencia_referencia, r.score_referencia
    from score_referencia_ordenado r
    where r.rn = 1
  ),
  preparadas as (
    select
      b.*,
      c.cobertura_minima,
      c.exige_pilar_fidelizacao,
      c.faixa_atencao_min,
      c.faixa_saudavel_min,
      cm.amostra_minima,
      public.normalizar_health_score_professor_v3_meta_viva(
        b.metrica,
        b.valor_bruto,
        b.meta,
        b.nota
      ) as nota_coerente,
      (
        b.metrica = 'conversao'
        and b.valor_bruto is not null
        and coalesce(b.amostra, 0) >= coalesce(cm.amostra_minima, 3)
        and b.estado_base in ('provisorio_ciclo', 'em_andamento', 'ok')
      ) as conversao_elegivel
    from base b
    cross join configuracao c
    left join public.health_score_professor_v3_config_metricas cm
      on cm.config_id = c.id
     and cm.metrica = b.metrica
  ),
  metricas_coerentes as (
    select
      p.*,
      case
        when p.metrica = 'numero_alunos' then false
        when p.metrica = 'conversao' then p.conversao_elegivel
        else coalesce(p.peso_disponivel, false) and p.nota_coerente is not null
      end as peso_disponivel_coerente,
      case
        when p.metrica = 'numero_alunos' then 'diagnostico_carteira'
        when p.metrica = 'conversao' and p.conversao_elegivel
          then 'evidencia_valida_em_andamento'
        else p.codigo_evidencia
      end::text as codigo_evidencia_coerente
    from preparadas p
  ),
  entrada_calculo as (
    select
      m.professor_id,
      m.unidade_id,
      max(m.cobertura_minima) as cobertura_minima,
      bool_or(m.exige_pilar_fidelizacao) as exige_pilar_fidelizacao,
      max(m.faixa_atencao_min) as faixa_atencao_min,
      max(m.faixa_saudavel_min) as faixa_saudavel_min,
      jsonb_agg(
        jsonb_build_object(
          'metrica', m.metrica,
          'nota', case
            when m.peso_disponivel_coerente then m.nota_coerente
            else null::numeric
          end,
          'peso', coalesce(m.peso, 0),
          'peso_disponivel', m.peso_disponivel_coerente,
          'papel', m.papel,
          'codigo_evidencia', m.codigo_evidencia_coerente
        ) order by m.metrica
      ) as metricas
    from metricas_coerentes m
    group by m.professor_id, m.unidade_id
  ),
  calculos as (
    select
      e.*,
      public.calcular_health_score_professor_v3_nota_diagnostica(
        e.metricas,
        e.cobertura_minima,
        e.exige_pilar_fidelizacao
      ) as calculo
    from entrada_calculo e
  ),
  metricas_calculadas as (
    select
      m.*,
      c.calculo,
      (item.valor ->> 'peso_efetivo')::numeric as peso_efetivo_coerente,
      case
        when m.peso_disponivel_coerente and m.nota_coerente is not null then
          round(
            m.nota_coerente * (item.valor ->> 'peso_efetivo')::numeric / 100,
            4
          )
        else null::numeric
      end as contribuicao_coerente
    from metricas_coerentes m
    join calculos c
      on c.professor_id = m.professor_id
     and c.unidade_id is not distinct from m.unidade_id
    join lateral jsonb_array_elements(c.calculo -> 'metricas') item(valor)
      on item.valor ->> 'metrica' = m.metrica
  ),
  metricas_com_soma as (
    select
      m.*,
      round(sum(coalesce(m.contribuicao_coerente, 0)) over (
        partition by m.professor_id, m.unidade_id
      ), 4) as soma_contribuicoes
    from metricas_calculadas m
  )
  select
    m.professor_id,
    m.unidade_id,
    m.escopo,
    m.competencia,
    m.trimestre_inicio,
    m.periodicidade,
    m.periodo_inicio,
    m.periodo_fim,
    m.ciclo_codigo,
    'em_andamento'::text as estado_publicacao,
    nullif(m.calculo ->> 'score', '') is not null as score_exibivel,
    false as ranking_habilitado,
    m.config_versao,
    0 as revisao,
    (m.calculo ->> 'score')::numeric as score,
    (m.calculo ->> 'cobertura')::numeric as cobertura,
    case
      when nullif(m.calculo ->> 'score', '') is null then 'sem_base'
      when (m.calculo ->> 'score')::numeric >= m.faixa_saudavel_min then 'saudavel'
      when (m.calculo ->> 'score')::numeric >= m.faixa_atencao_min then 'atencao'
      else 'critico'
    end::text as classificacao,
    'em_andamento'::text as estado,
    false as snapshot_publicavel,
    false as publicado,
    'competencia_em_andamento'::text as motivo_bloqueio,
    'health-score-professor-v3-nota-viva-coerente-1'::text as regra_versao_snapshot,
    m.metrica,
    m.valor_bruto,
    m.numerador,
    m.denominador,
    case when m.peso_disponivel_coerente then m.nota_coerente else null::numeric end as nota,
    m.peso,
    m.peso_disponivel_coerente as peso_disponivel,
    m.peso_efetivo_coerente as peso_efetivo,
    m.contribuicao_coerente as contribuicao,
    m.meta,
    m.amostra,
    case
      when m.metrica = 'conversao' and m.conversao_elegivel then 'em_andamento'
      else m.estado_base
    end::text as estado_base,
    case
      when m.metrica = 'conversao' and m.conversao_elegivel then true
      else m.metrica_publicavel
    end as metrica_publicavel,
    m.confianca,
    m.fonte,
    'health-score-professor-v3-nota-viva-coerente-1'::text as regra_versao_metrica,
    case
      when m.metrica = 'conversao' and m.conversao_elegivel then null::text
      else m.motivo_sem_base
    end::text as motivo_sem_base,
    m.codigo_evidencia_coerente as codigo_evidencia,
    m.papel,
    coalesce(m.detalhes, '{}'::jsonb) || jsonb_build_object(
      'normalizacao_meta_viva', m.metrica in (
        'retencao', 'permanencia', 'conversao', 'presenca'
      ),
      'conversao_elegivel', m.conversao_elegivel,
      'score_atual_em_formacao', (m.calculo ->> 'score')::numeric,
      'score_igual_soma_contribuicoes',
        round((m.calculo ->> 'score')::numeric, 2)
          = round(m.soma_contribuicoes, 2),
      'soma_contribuicoes', m.soma_contribuicoes,
      'score_operacional_origem', 'competencia_atual',
      'score_referencia_origem', 'competencia_anterior',
      'score_competencia_referencia', r.competencia_referencia,
      'score_referencia', r.score_referencia
    ) as detalhes
  from metricas_com_soma m
  left join score_referencia r on r.professor_id = m.professor_id
  order by m.professor_id, case m.metrica
    when 'retencao' then 1
    when 'permanencia' then 2
    when 'conversao' then 3
    when 'media_turma' then 4
    when 'numero_alunos' then 5
    when 'presenca' then 6
    else 99
  end;
$function$;

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
    projecao_viva as (
      select v.*
      from public.get_health_score_professor_v3_projecao_viva_coerente(
        v_competencia,
        p_unidade_id,
        p_periodicidade
      ) v
      where not exists (
        select 1 from oficiais o where o.professor_id = v.professor_id
      )
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
    select v.* from projecao_viva v
    union all
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
    from snapshots_oficiais s
    join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
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
    sm.metrica, sm.valor_bruto, sm.numerador, sm.denominador, sm.nota,
    sm.peso, sm.peso_disponivel, sm.peso_efetivo, sm.contribuicao,
    sm.meta_aplicada, sm.amostra, sm.estado_base, sm.publicavel, sm.confianca,
    sm.fonte, sm.regra_versao, sm.motivo_sem_base, sm.codigo_evidencia,
    sm.papel, coalesce(sm.detalhes, '{}'::jsonb)
  from candidatos s
  join public.health_score_professor_v3_snapshot_metricas sm on sm.snapshot_id = s.id
  where s.rn = 1;
end;
$function$;

revoke all on function public.normalizar_health_score_professor_v3_meta_viva(
  text, numeric, numeric, numeric
) from public, anon;
grant execute on function public.normalizar_health_score_professor_v3_meta_viva(
  text, numeric, numeric, numeric
) to authenticated, service_role;

revoke all on function public.get_health_score_professor_v3_projecao_viva_coerente(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_projecao_viva_coerente(
  date, uuid, text
) to service_role;

revoke all on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) from public, anon;
grant execute on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) to authenticated, service_role;

comment on function public.get_health_score_professor_v3_projecao_viva_coerente(
  date, uuid, text
) is
  'Projecao viva coerente: score corrente igual a soma das contribuicoes, metas operacionais e referencia anterior apenas contextual.';

comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Leitura V3: competencia atual usa exclusivamente a nota viva corrente; historico fechado permanece imutavel.';

commit;
