begin;

-- Os produtores de evidencias permanecem deliberadamente esparsos. Este read
-- model e a fronteira canonica que completa o roster elegivel x catalogo
-- governado, sem transformar ausencia de fonte em zero.
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
  with
  parametros as (
    select
      date_trunc('month', p_competencia)::date as competencia,
      case
        when p_periodicidade = 'mensal'
          then date_trunc('month', p_competencia)::date
        when extract(month from p_competencia)::integer between 6 and 8
          then make_date(extract(year from p_competencia)::integer, 6, 1)
        when extract(month from p_competencia)::integer between 9 and 11
          then make_date(extract(year from p_competencia)::integer, 9, 1)
        when extract(month from p_competencia)::integer = 12
          then make_date(extract(year from p_competencia)::integer, 12, 1)
        when extract(month from p_competencia)::integer between 1 and 2
          then make_date(extract(year from p_competencia)::integer - 1, 12, 1)
        else make_date(extract(year from p_competencia)::integer, 3, 1)
      end as periodo_inicio,
      case
        when p_periodicidade = 'mensal'
          then (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date
        when extract(month from p_competencia)::integer between 6 and 8
          then make_date(extract(year from p_competencia)::integer, 8, 31)
        when extract(month from p_competencia)::integer between 9 and 11
          then make_date(extract(year from p_competencia)::integer, 11, 30)
        when extract(month from p_competencia)::integer = 12
          then (make_date(extract(year from p_competencia)::integer + 1, 3, 1) - 1)
        when extract(month from p_competencia)::integer between 1 and 2
          then (make_date(extract(year from p_competencia)::integer, 3, 1) - 1)
        else make_date(extract(year from p_competencia)::integer, 5, 31)
      end as periodo_fim,
      case
        when p_periodicidade = 'mensal' then to_char(p_competencia, 'YYYY-MM')
        when extract(month from p_competencia)::integer between 6 and 8
          then format('%s-JUN-AGO', extract(year from p_competencia)::integer)
        when extract(month from p_competencia)::integer between 9 and 11
          then format('%s-SET-NOV', extract(year from p_competencia)::integer)
        when extract(month from p_competencia)::integer = 12
          then format(
            '%s-DEZ-%s-FEV',
            extract(year from p_competencia)::integer,
            extract(year from p_competencia)::integer + 1
          )
        when extract(month from p_competencia)::integer between 1 and 2
          then format(
            '%s-DEZ-%s-FEV',
            extract(year from p_competencia)::integer - 1,
            extract(year from p_competencia)::integer
          )
        else format('%s-MAR-MAI', extract(year from p_competencia)::integer)
      end as ciclo_codigo
    where p_competencia is not null
      and p_periodicidade in ('mensal', 'ciclo')
  ), configuracao as (
    select c.*
    from public.health_score_professor_v3_config_versoes c
    cross join parametros p
    where c.status = 'ativa'
      and p.competencia >= c.vigencia_inicio
      and (c.vigencia_fim is null or p.competencia <= c.vigencia_fim)
    order by c.vigencia_inicio desc, c.versao desc, c.id desc
    limit 1
  ), catalogo as (
    select
      cm.config_id,
      cm.metrica,
      cm.peso::numeric as peso,
      cm.meta::numeric as meta,
      coalesce(nullif(cm.parametros ->> 'papel', ''), 'nota')::text as papel
    from public.health_score_professor_v3_config_metricas cm
    join configuracao c on c.id = cm.config_id
    where cm.metrica in (
      'retencao', 'permanencia', 'conversao',
      'media_turma', 'numero_alunos', 'presenca'
    )
  ), governo as (
    select
      count(*) filter (where papel = 'nota')::integer as pilares_esperados,
      coalesce(sum(peso) filter (where papel = 'nota'), 0)::numeric
        as peso_pontuavel_total
    from catalogo
  ), roster as materialized (
    select distinct pr.id as professor_id
    from public.professores pr
    join public.professores_unidades pu on pu.professor_id = pr.id
    join public.unidades u on u.id = pu.unidade_id and u.ativo = true
    where pr.ativo = true
      -- Preserva a exclusao permanente de cadastros ja mesclados. O acesso via
      -- jsonb mantem a migration testavel em fixtures anteriores a essa coluna.
      and to_jsonb(pr) ->> 'mesclado_em_professor_id' is null
      and pu.emusys_ativo = true
      and pu.validacao_status is distinct from 'ignorado'
      and (p_unidade_id is null or pu.unidade_id = p_unidade_id)
  ), base as materialized (
    select b.*
    from public.get_hs_prof_v3_performance_before_scope_fix_20260804(
      p_competencia, p_unidade_id, p_periodicidade
    ) b
    where (p_unidade_id is null or b.unidade_id is not distinct from p_unidade_id)
      and exists (select 1 from roster r where r.professor_id = b.professor_id)
  ), base_unica as (
    select distinct on (b.professor_id, b.metrica) b.*
    from base b
    order by
      b.professor_id,
      b.metrica,
      b.metrica_publicavel desc nulls last,
      (b.nota is not null) desc,
      b.unidade_id nulls last
  ), modelo as (
    select distinct on (b.professor_id) b.*
    from base_unica b
    order by b.professor_id, (b.config_id is not null) desc, b.metrica
  ), saudaveis as (
    select b.professor_id
    from base_unica b
    join catalogo c on c.metrica = b.metrica
    cross join governo g
    group by b.professor_id, g.pilares_esperados
    having count(*) = (select count(*) from catalogo)
      and count(*) filter (
        where c.papel = 'nota'
          and b.nota is not null
          and coalesce(b.peso_disponivel, false)
          and coalesce(b.metrica_publicavel, false)
      ) = g.pilares_esperados
  ), matriz as materialized (
    select
      r.professor_id,
      c.metrica,
      c.peso,
      c.meta,
      c.papel,
      b.valor_bruto,
      b.numerador,
      b.denominador,
      b.nota,
      b.amostra,
      b.estado_base,
      b.metrica_publicavel,
      b.confianca,
      b.fonte,
      b.regra_versao_metrica,
      b.motivo_sem_base,
      b.codigo_evidencia,
      b.detalhes,
      b.professor_id is not null as evidencia_emitida,
      coalesce(b.peso_disponivel, false)
        and b.nota is not null
        and coalesce(b.metrica_publicavel, false)
        and c.papel = 'nota' as evidencia_pontuavel
    from roster r
    cross join catalogo c
    left join base_unica b
      on b.professor_id = r.professor_id
     and b.metrica = c.metrica
  ), resumo as (
    select
      m.professor_id,
      count(*) filter (where m.evidencia_pontuavel)::integer as pilares_validos,
      coalesce(sum(m.peso) filter (where m.evidencia_pontuavel), 0)::numeric
        as peso_disponivel_total,
      round(
        sum(m.nota * m.peso) filter (where m.evidencia_pontuavel)
          / nullif(sum(m.peso) filter (where m.evidencia_pontuavel), 0),
        2
      ) as score_observado,
      coalesce(bool_or(
        m.metrica in ('retencao', 'permanencia') and m.evidencia_pontuavel
      ), false) as tem_fidelizacao,
      not coalesce(bool_or(
        coalesce(m.codigo_evidencia, '') = 'fonte_canonica_indisponivel'
          and nullif(m.detalhes ->> 'motivo_auditoria', '') is not null
      ), false) as fonte_canonica_disponivel
    from matriz m
    group by m.professor_id
  ), avaliada as (
    select
      r.*,
      g.pilares_esperados,
      g.peso_pontuavel_total,
      case
        when g.pilares_esperados <= 0 then 0::numeric
        else round(r.pilares_validos * 100.0 / g.pilares_esperados, 1)
      end as cobertura_pilares,
      c.cobertura_minima,
      coalesce(
        nullif(to_jsonb(c) ->> 'pilares_minimos', '')::integer,
        3
      ) as pilares_minimos,
      c.faixa_atencao_min,
      c.faixa_saudavel_min,
      r.score_observado is not null
        and r.pilares_validos >= coalesce(
          nullif(to_jsonb(c) ->> 'pilares_minimos', '')::integer,
          3
        )
        and (
          case when g.pilares_esperados <= 0 then 0::numeric
            else round(r.pilares_validos * 100.0 / g.pilares_esperados, 1) end
        ) >= coalesce(c.cobertura_minima, 60)
        and r.tem_fidelizacao
        and r.fonte_canonica_disponivel as comparavel
    from resumo r
    cross join governo g
    cross join configuracao c
  )
  select
    m.professor_id,
    case when p_unidade_id is null then null::uuid else p_unidade_id end,
    case when p_unidade_id is null then 'consolidado'::text else 'unidade'::text end,
    p.competencia,
    coalesce(md.trimestre_inicio, date_trunc('quarter', p.competencia)::date),
    p_periodicidade,
    p.periodo_inicio,
    p.periodo_fim,
    p.ciclo_codigo,
    coalesce(md.estado_publicacao, 'em_andamento'::text),
    a.score_observado is not null,
    false,
    c.versao,
    coalesce(md.revisao, 0),
    a.score_observado,
    a.cobertura_pilares,
    case
      when not a.comparavel then null::text
      when a.score_observado >= a.faixa_saudavel_min then 'saudavel'::text
      when a.score_observado >= a.faixa_atencao_min then 'atencao'::text
      else 'critico'::text
    end,
    case when a.comparavel then 'provisorio'::text else 'em_maturacao'::text end,
    false,
    false,
    case
      when a.score_observado is null then 'sem_evidencia_pontuavel'::text
      when not a.comparavel then 'pilares_insuficientes'::text
      else null::text
    end,
    coalesce(md.regra_versao_snapshot, 'health-score-professor-v3-roster-canonico-1'),
    m.metrica,
    m.valor_bruto,
    m.numerador,
    m.denominador,
    m.nota,
    m.peso,
    m.evidencia_pontuavel,
    case
      when m.evidencia_pontuavel and a.peso_disponivel_total > 0
        then round(m.peso * 100 / a.peso_disponivel_total, 4)
      else 0::numeric
    end,
    case
      when m.evidencia_pontuavel and a.peso_disponivel_total > 0
        then round(m.nota * m.peso / a.peso_disponivel_total, 4)
      else null::numeric
    end,
    m.meta,
    case when m.evidencia_emitida then m.amostra else null::integer end,
    case when m.evidencia_emitida then m.estado_base else 'sem_base'::text end,
    case when m.evidencia_emitida then m.metrica_publicavel else false end,
    case when m.evidencia_emitida then m.confianca else 'sem_base'::text end,
    case when m.evidencia_emitida
      then m.fonte else 'health_score_v3_matriz_roster'::text end,
    case when m.evidencia_emitida
      then m.regra_versao_metrica
      else 'health-score-professor-v3-roster-canonico-1'::text end,
    case when m.evidencia_emitida
      then m.motivo_sem_base
      else 'nenhuma evidencia canonica emitida para a metrica no periodo'::text end,
    case when m.evidencia_emitida
      then m.codigo_evidencia else 'fonte_canonica_sem_evidencia'::text end,
    m.papel,
    coalesce(m.detalhes, '{}'::jsonb) || case
      when not m.evidencia_emitida then jsonb_build_object(
        'matriz_roster_preenchida', true,
        'ausencia_convertida_em_zero', false
      )
      else '{}'::jsonb
    end,
    a.score_observado,
    case when a.comparavel then a.score_observado else null::numeric end,
    a.pilares_validos,
    a.pilares_esperados,
    case
      when a.comparavel then 'comparavel'::text
      when a.pilares_validos = 0 then 'sem_base_operacional'::text
      else 'em_maturacao'::text
    end,
    case
      when a.pilares_validos = 0 then 'sem_pilares_validos'::text
      when not a.fonte_canonica_disponivel then 'fonte_em_auditoria'::text
      when a.score_observado is null then 'score_observado_indisponivel'::text
      when a.pilares_validos < a.pilares_minimos then 'pilares_insuficientes'::text
      when a.cobertura_pilares < coalesce(a.cobertura_minima, 60)
        then 'cobertura_insuficiente'::text
      when not a.tem_fidelizacao then 'sem_pilar_fidelizacao'::text
      else 'criterios_atendidos'::text
    end,
    md.competencia_referencia,
    md.score_referencia,
    md.classificacao_referencia,
    coalesce(md.data_corte, current_date),
    c.id,
    coalesce(md.regra_fingerprint, 'health-score-professor-v3-roster-canonico-1'),
    a.peso_pontuavel_total,
    a.peso_disponivel_total,
    a.cobertura_pilares,
    coalesce(a.cobertura_minima, 60),
    case when a.comparavel then '[]'::jsonb else
      case when a.pilares_validos = 0
        then '["sem_pilares_validos"]'::jsonb else '[]'::jsonb end
      || case when a.score_observado is null
        then '["score_observado_indisponivel"]'::jsonb else '[]'::jsonb end
      || case when a.pilares_validos < a.pilares_minimos
        then '["pilares_insuficientes"]'::jsonb else '[]'::jsonb end
      || case when a.cobertura_pilares < coalesce(a.cobertura_minima, 60)
        then '["cobertura_insuficiente"]'::jsonb else '[]'::jsonb end
      || case when not a.tem_fidelizacao
        then '["sem_pilar_fidelizacao"]'::jsonb else '[]'::jsonb end
      || case when not a.fonte_canonica_disponivel
        then '["fonte_canonica_indisponivel"]'::jsonb else '[]'::jsonb end
    end
  from matriz m
  join avaliada a on a.professor_id = m.professor_id
  cross join parametros p
  cross join configuracao c
  left join modelo md on md.professor_id = m.professor_id
  where not exists (
    select 1 from saudaveis s where s.professor_id = m.professor_id
  )

  union all

  -- Professor ja completo e comparavel atravessa a fronteira sem qualquer
  -- recalculo. A Sprint 1 so completa lacunas; nao reinterpreta dado saudavel.
  select b.*
  from base_unica b
  join saudaveis s on s.professor_id = b.professor_id;
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
  'Read model V3: monta a matriz canonica roster elegivel x seis metricas; ausencia de produtor vira sem_base explicito e cobertura usa pilares validos.';

commit;
