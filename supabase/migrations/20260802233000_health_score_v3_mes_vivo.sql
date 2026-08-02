begin;

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
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with parametros as (
    select
      date_trunc('month', p_competencia)::date as competencia,
      date_trunc(
        'month',
        timezone('America/Sao_Paulo', now())
      )::date as competencia_atual
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
  metricas_atuais_base as (
    select m.*
    from parametros p
    cross join lateral public.get_health_score_professor_v3_metricas_periodo(
      p.competencia,
      p_unidade_id,
      p_periodicidade
    ) m
    where p.competencia = p.competencia_atual
      and p_periodicidade = 'mensal'
  ),
  metricas_segmentadas_atuais as (
    select s.*
    from parametros p
    cross join configuracao c
    cross join lateral
      public.get_health_score_professor_v3_metricas_segmentadas_agregadas_v1(
        p.competencia,
        c.id,
        p_unidade_id,
        p_periodicidade
      ) s
    where p.competencia = p.competencia_atual
      and p_periodicidade = 'mensal'
  ),
  metricas_atuais as (
    select
      b.metrica,
      b.professor_id,
      b.professor_nome,
      b.unidade_id,
      b.competencia,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then s.valor_bruto
        else b.valor_bruto
      end as valor_bruto,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then s.numerador
        else b.numerador
      end as numerador,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then s.denominador
        else b.denominador
      end as denominador,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then s.amostra
        else b.amostra
      end as amostra,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.estado_base, b.estado_base)
        else b.estado_base
      end as estado_base,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.publicavel, false)
        else b.publicavel
      end as publicavel,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.confianca, b.confianca)
        else b.confianca
      end as confianca,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.fonte, b.fonte)
        else b.fonte
      end as fonte,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.regra_versao, b.regra_versao)
        else b.regra_versao
      end as regra_versao,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.motivo_sem_base, b.motivo_sem_base)
        else b.motivo_sem_base
      end as motivo_sem_base,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then coalesce(s.detalhes, b.detalhes, '{}'::jsonb)
            || jsonb_build_object(
              'normalizacao', 'segmentada_unidade_curso_modalidade',
              'valor_real_preservado', true
            )
        else b.detalhes
      end as detalhes,
      case
        when b.metrica in ('media_turma', 'numero_alunos')
          then s.nota
        else null::numeric
      end as nota_segmentada
    from metricas_atuais_base b
    left join metricas_segmentadas_atuais s
      on s.professor_id = b.professor_id
     and s.unidade_id is not distinct from b.unidade_id
     and s.metrica = b.metrica
  ),
  referencias_ordenadas as (
    select
      s.professor_id,
      m.metrica,
      s.competencia as competencia_referencia,
      m.valor_bruto as valor_referencia,
      m.numerador as numerador_referencia,
      m.denominador as denominador_referencia,
      m.amostra as amostra_referencia,
      row_number() over (
        partition by s.professor_id, m.metrica
        order by
          s.competencia desc,
          (s.estado_publicacao = 'oficial') desc,
          s.revisao desc,
          s.criado_em desc,
          s.id desc
      ) as rn
    from public.health_score_professor_v3_snapshots s
    join public.health_score_professor_v3_snapshot_metricas m
      on m.snapshot_id = s.id
    cross join parametros p
    where s.competencia < p.competencia
      and s.unidade_id is not distinct from p_unidade_id
      and s.periodicidade = p_periodicidade
      and s.estado in ('provisorio', 'em_maturacao', 'fechado')
      and s.invalidado_em is null
      and m.valor_bruto is not null
  ),
  referencias as (
    select r.*
    from referencias_ordenadas r
    where r.rn = 1
  ),
  metricas_preparadas as (
    select
      a.*,
      c.id as config_id,
      c.versao as config_versao,
      c.cobertura_minima,
      c.exige_pilar_fidelizacao,
      c.faixa_atencao_min,
      c.faixa_saudavel_min,
      cm.peso,
      cm.meta,
      cm.amostra_minima,
      coalesce(
        a.valor_bruto,
        case
          when nullif(a.detalhes ->> 'valor_observado', '') is not null
            then (a.detalhes ->> 'valor_observado')::numeric
          else null::numeric
        end
      ) as valor_atual_observado,
      r.competencia_referencia,
      r.valor_referencia,
      r.numerador_referencia,
      r.denominador_referencia,
      r.amostra_referencia,
      (
        coalesce(
          a.valor_bruto,
          case
            when nullif(a.detalhes ->> 'valor_observado', '') is not null
              then (a.detalhes ->> 'valor_observado')::numeric
            else null::numeric
          end
        ) is null
        and r.valor_referencia is not null
      ) as referencia_temporaria,
      case
        when a.metrica = 'numero_alunos' then null::numeric
        when not coalesce(a.publicavel, false)
          or a.estado_base in (
            'em_maturacao',
            'revisar',
            'sem_base',
            'sem_base_amostra',
            'sem_base_cobertura',
            'sem_base_sem_turmas',
            'sem_base_zero_carteira',
            'regra_ausente',
            'segmentacao_incompleta',
            'divergencia_nao_ofertada',
            'em_auditoria',
            'bloqueada'
          ) then null::numeric
        when a.metrica = 'conversao'
          and coalesce(a.amostra, 0) < coalesce(cm.amostra_minima, 3)
          then null::numeric
        when a.metrica = 'media_turma' then a.nota_segmentada
        when a.metrica in ('retencao', 'conversao', 'presenca')
          and a.valor_bruto is not null
          and coalesce(cm.meta, 0) > 0
          then greatest(0::numeric, least(100::numeric, a.valor_bruto))
        when a.metrica = 'permanencia'
          and a.valor_bruto is not null
          and coalesce(cm.meta, 0) > 0
          then round(least(100::numeric, greatest(
            0::numeric,
            a.valor_bruto / nullif(cm.meta, 0) * 100
          )), 2)
        else null::numeric
      end as nota_atual,
      case
        when a.metrica = 'numero_alunos' then 'diagnostico'
        else 'nota'
      end as papel_metrica
    from metricas_atuais a
    cross join configuracao c
    left join public.health_score_professor_v3_config_metricas cm
      on cm.config_id = c.id
     and cm.metrica = a.metrica
    left join referencias r
      on r.professor_id = a.professor_id
     and r.metrica = a.metrica
  ),
  metricas_com_estado as (
    select
      p.*,
      case
        when p.referencia_temporaria then false
        when p.papel_metrica = 'diagnostico' then false
        when p.metrica = 'conversao' then
          p.nota_atual is not null
          and coalesce(p.amostra, 0) >= coalesce(p.amostra_minima, 3)
        else p.nota_atual is not null
      end as peso_disponivel_atual,
      case
        when p.referencia_temporaria then 'referencia_periodo_anterior'
        else public.fn_health_score_professor_v3_codigo_evidencia(
          p.metrica,
          p.estado_base,
          p.publicavel,
          p.nota_atual,
          p.amostra,
          p.amostra_minima,
          p.detalhes
        )
      end as codigo_evidencia_atual
    from metricas_preparadas p
  ),
  entrada_calculo as (
    select
      m.professor_id,
      m.unidade_id,
      max(m.config_versao) as config_versao,
      max(m.cobertura_minima) as cobertura_minima,
      bool_or(m.exige_pilar_fidelizacao) as exige_pilar_fidelizacao,
      max(m.faixa_atencao_min) as faixa_atencao_min,
      max(m.faixa_saudavel_min) as faixa_saudavel_min,
      jsonb_agg(
        jsonb_build_object(
          'metrica', m.metrica,
          'nota', case when m.peso_disponivel_atual then m.nota_atual else null end,
          'peso', coalesce(m.peso, 0),
          'peso_disponivel', m.peso_disponivel_atual,
          'papel', m.papel_metrica,
          'codigo_evidencia', m.codigo_evidencia_atual
        ) order by m.metrica
      ) as metricas
    from metricas_com_estado m
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
      (mc.item ->> 'peso_efetivo')::numeric as peso_efetivo_atual
    from metricas_com_estado m
    join calculos c
      on c.professor_id = m.professor_id
     and c.unidade_id is not distinct from m.unidade_id
    join lateral jsonb_array_elements(c.calculo -> 'metricas') mc(item)
      on mc.item ->> 'metrica' = m.metrica
  )
  select
    m.professor_id,
    m.unidade_id,
    case when p_unidade_id is null then 'consolidado' else 'unidade' end::text,
    p.competencia,
    case
      when extract(month from p.competencia) between 3 and 5
        then make_date(extract(year from p.competencia)::integer, 3, 1)
      when extract(month from p.competencia) between 6 and 8
        then make_date(extract(year from p.competencia)::integer, 6, 1)
      when extract(month from p.competencia) between 9 and 11
        then make_date(extract(year from p.competencia)::integer, 9, 1)
      when extract(month from p.competencia) = 12
        then make_date(extract(year from p.competencia)::integer, 12, 1)
      else make_date(extract(year from p.competencia)::integer - 1, 12, 1)
    end as trimestre_inicio,
    p_periodicidade,
    p.competencia as periodo_inicio,
    (p.competencia + interval '1 month - 1 day')::date as periodo_fim,
    'mensal'::text as ciclo_codigo,
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
    'health-score-professor-v3-mes-vivo-1'::text as regra_versao_snapshot,
    m.metrica,
    case
      when m.referencia_temporaria then m.valor_referencia
      else m.valor_atual_observado
    end as valor_bruto,
    case
      when m.referencia_temporaria then m.numerador_referencia
      else m.numerador
    end as numerador,
    case
      when m.referencia_temporaria then m.denominador_referencia
      else m.denominador
    end as denominador,
    case when m.peso_disponivel_atual then m.nota_atual else null::numeric end as nota,
    coalesce(m.peso, 0) as peso,
    m.peso_disponivel_atual as peso_disponivel,
    m.peso_efetivo_atual as peso_efetivo,
    case
      when m.peso_disponivel_atual and m.nota_atual is not null
        then round(m.nota_atual * m.peso_efetivo_atual / 100, 4)
      else null::numeric
    end as contribuicao,
    m.meta,
    case
      when m.referencia_temporaria then m.amostra_referencia
      else m.amostra
    end as amostra,
    case
      when m.referencia_temporaria then 'referencia_periodo_anterior'
      else m.estado_base
    end::text as estado_base,
    case
      when m.referencia_temporaria then false
      else m.publicavel
    end as metrica_publicavel,
    case
      when m.referencia_temporaria then 'referencia_historica'
      else m.confianca
    end::text as confianca,
    m.fonte,
    'health-score-professor-v3-mes-vivo-1'::text as regra_versao_metrica,
    case
      when m.referencia_temporaria
        then 'Aguardando eventos da competencia atual; exibindo a ultima base disponivel'
      else m.motivo_sem_base
    end::text as motivo_sem_base,
    m.codigo_evidencia_atual as codigo_evidencia,
    m.papel_metrica as papel,
    coalesce(m.detalhes, '{}'::jsonb) || case
      when m.referencia_temporaria then jsonb_build_object(
        'referencia_temporaria', true,
        'competencia_referencia', m.competencia_referencia,
        'valor_referencia', m.valor_referencia,
        'nao_compoe_nota_atual', true
      )
      else jsonb_build_object(
        'referencia_temporaria', false,
        'competencia_referencia', null,
        'valor_referencia', null,
        'nao_compoe_nota_atual', false
      )
    end as detalhes
  from metricas_calculadas m
  cross join parametros p
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
      from public.get_health_score_professor_v3_projecao_viva(
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
  select p.*
  from public.get_health_score_professor_v3_performance(
    p_competencia,
    p_unidade_id,
    p_periodicidade
  ) p
  where p.professor_id = p_professor_id
  order by case p.metrica
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

revoke all on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) from public, anon, authenticated;
grant execute on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) to service_role;

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

comment on function public.get_health_score_professor_v3_projecao_viva(
  date, uuid, text
) is
  'Projecao somente leitura da competencia atual. Referencias anteriores sao explicitas e nunca pontuam.';
comment on function public.get_health_score_professor_v3_performance(
  date, uuid, text
) is
  'Leitura V3: snapshot governado no historico e projecao canonica viva na competencia atual aberta.';
comment on function public.get_health_score_professor_v3_snapshot_modal(
  date, uuid, integer, text
) is
  'Detalhe V3 pelo mesmo contrato da tabela, incluindo a competencia atual em andamento.';

commit;
