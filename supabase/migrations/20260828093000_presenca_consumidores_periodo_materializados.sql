-- Impede que funcoes STABLE de periodo sejam expandidas e recalculadas por
-- linha/professor. Os recortes canonicos continuam identicos e passam a ser
-- avaliados uma unica vez por unidade e periodo.

create or replace function public.fn_presenca_estado_publicacao_periodo_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with dias_operacionais as materialized (
    select distinct ae.data_aula
    from public.aulas_emusys ae
    where ae.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and ae.data_hora_fim < clock_timestamp()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
  ), pendencias_por_dia as materialized (
    select
      d.data_aula,
      public.fn_presenca_pendencias_do_dia_v2(
        p_unidade_id,
        d.data_aula
      ) as estado
    from dias_operacionais d
  ), resumo as (
    select
      count(*)::integer as dias_operacionais,
      count(*) filter (
        where p.estado ->> 'dados_status' = 'atualizados'
          and jsonb_array_length(
            coalesce(p.estado -> 'pendencias', '[]'::jsonb)
          ) = 0
          and jsonb_array_length(
            coalesce(p.estado -> 'conflitos', '[]'::jsonb)
          ) = 0
      )::integer as dias_publicaveis,
      count(*) filter (
        where p.estado ->> 'dados_status' = 'dados_desatualizados'
      )::integer as dias_desatualizados,
      count(*) filter (
        where p.estado ->> 'dados_status' = 'roster_em_revisao'
          or jsonb_array_length(
            coalesce(p.estado -> 'revisoes_estruturais', '[]'::jsonb)
          ) > 0
      )::integer as dias_roster_em_revisao,
      count(*) filter (
        where jsonb_array_length(
          coalesce(p.estado -> 'pendencias', '[]'::jsonb)
        ) > 0
      )::integer as dias_com_pendencias,
      count(*) filter (
        where jsonb_array_length(
          coalesce(p.estado -> 'conflitos', '[]'::jsonb)
        ) > 0
      )::integer as dias_com_conflitos,
      max(nullif(p.estado ->> 'sincronizado_em', '')::timestamptz)
        as sincronizado_em
    from pendencias_por_dia p
  )
  select jsonb_build_object(
    'dados_status', case
      when r.dias_operacionais = 0 then 'sem_base'
      when r.dias_roster_em_revisao > 0 then 'roster_em_revisao'
      when r.dias_desatualizados > 0 then 'dados_desatualizados'
      when r.dias_com_pendencias > 0 or r.dias_com_conflitos > 0
        then 'em_auditoria'
      when r.dias_publicaveis = r.dias_operacionais then 'atualizados'
      else 'em_auditoria'
    end,
    'estado_publicacao', case
      when r.dias_operacionais = 0 then 'sem_base'
      when r.dias_roster_em_revisao > 0 then 'bloqueado_roster'
      when r.dias_desatualizados > 0 then 'bloqueado_frescor'
      when r.dias_com_pendencias > 0 or r.dias_com_conflitos > 0
        then 'em_auditoria'
      when r.dias_publicaveis = r.dias_operacionais then 'publicavel'
      else 'em_auditoria'
    end,
    'publicavel',
      r.dias_operacionais > 0
      and r.dias_roster_em_revisao = 0
      and r.dias_desatualizados = 0
      and r.dias_com_pendencias = 0
      and r.dias_com_conflitos = 0
      and r.dias_publicaveis = r.dias_operacionais,
    'dias_operacionais', r.dias_operacionais,
    'dias_publicaveis', r.dias_publicaveis,
    'dias_desatualizados', r.dias_desatualizados,
    'dias_roster_em_revisao', r.dias_roster_em_revisao,
    'dias_com_pendencias', r.dias_com_pendencias,
    'dias_com_conflitos', r.dias_com_conflitos,
    'sincronizado_em', r.sincronizado_em,
    'regra_versao', 'presenca-publicacao-periodo-v2.2'
  )
  from resumo r;
$function$;

-- A view canonica continua sendo a unica dona da precedencia. Este helper
-- apenas impede que o planner transforme um recorte mensal em um produto
-- cartesiano: cada dia e consultado isoladamente, com unidade obrigatoria.
create or replace function public.fn_presenca_ocorrencias_escopo_interno_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns setof public.vw_presenca_ocorrencia_metrica_v2
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_data date;
begin
  if p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim
     or p_data_fim - p_data_inicio > 370 then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_ESCOPO_INTERNO_INVALIDO';
  end if;

  for v_data in
    select d::date
    from pg_catalog.generate_series(
      p_data_inicio::timestamp,
      p_data_fim::timestamp,
      interval '1 day'
    ) d
  loop
    return query
    select o.*
    from public.vw_presenca_ocorrencia_metrica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula = v_data
      and (p_professor_id is null or o.professor_id = p_professor_id)
      and (p_aluno_id is null or o.aluno_id = p_aluno_id);
  end loop;
end;
$function$;

revoke all on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_ocorrencias_escopo_interno_v2(
  uuid, date, date, integer, integer
) to service_role;

create or replace function public.get_presenca_metricas_canonicas_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns table (
  unidade_id uuid,
  professor_id integer,
  aluno_id integer,
  periodo_inicio date,
  periodo_fim date,
  ocorrencias_observadas bigint,
  denominador_observado bigint,
  presentes_observados bigint,
  faltas_observadas bigint,
  faltas_justificadas_observadas bigint,
  eventos_excluidos_observados bigint,
  ocorrencias_incompletas bigint,
  conflitos bigint,
  denominador bigint,
  presentes bigint,
  faltas bigint,
  faltas_justificadas bigint,
  faltas_total bigint,
  percentual_presenca numeric,
  dados_status text,
  estado_publicacao text,
  sincronizado_em timestamptz,
  regra_versao text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_METRICA_PERIODO_INVALIDO';
  end if;

  return query
  with observada as materialized (
    select
      o.unidade_id,
      o.professor_id,
      o.aluno_id,
      count(*)::bigint as ocorrencias_observadas,
      count(*) filter (
        where o.considera_frequencia_denominador
      )::bigint as denominador_observado,
      count(*) filter (where o.considera_presenca)::bigint
        as presentes_observados,
      count(*) filter (where o.considera_falta)::bigint
        as faltas_observadas,
      count(*) filter (where o.considera_falta_justificada)::bigint
        as faltas_justificadas_observadas,
      count(*) filter (
        where o.resultado_canonico in (
          'aula_cancelada', 'aula_justificada'
        )
      )::bigint as eventos_excluidos_observados,
      count(*) filter (where o.ocorrencia_incompleta)::bigint
        as ocorrencias_incompletas,
      count(*) filter (where o.possui_conflito)::bigint as conflitos
    from public.fn_presenca_ocorrencias_escopo_interno_v2(
      p_unidade_id,
      p_data_inicio,
      p_data_fim,
      p_professor_id,
      p_aluno_id
    ) o
    group by o.unidade_id, o.professor_id, o.aluno_id
  ), alvo_deterministico as materialized (
    select o.*
    from observada o

    union all

    select
      p_unidade_id::uuid,
      p_professor_id::integer,
      p_aluno_id::integer,
      0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
      0::bigint, 0::bigint, 0::bigint
    where not exists (select 1 from observada)
  ), frescor as materialized (
    select public.fn_presenca_estado_publicacao_periodo_v2(
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    ) as envelope
  ), classificada as (
    select
      o.*,
      f.envelope as frescor,
      case
        when f.envelope ->> 'estado_publicacao' = 'sem_base'
          then 'sem_base'
        when f.envelope ->> 'estado_publicacao' = 'bloqueado_roster'
          then 'bloqueado_roster'
        when f.envelope ->> 'estado_publicacao' = 'bloqueado_frescor'
          then 'bloqueado_frescor'
        when f.envelope ->> 'estado_publicacao' = 'em_auditoria'
          then 'em_auditoria'
        when o.ocorrencias_incompletas > 0 or o.conflitos > 0
          then 'em_auditoria'
        when o.denominador_observado = 0 then 'sem_base'
        else 'publicavel'
      end as estado_publicacao_calculado,
      case
        when f.envelope ->> 'estado_publicacao' = 'sem_base'
          then 'sem_base'
        when f.envelope ->> 'estado_publicacao' = 'bloqueado_roster'
          then 'roster_em_revisao'
        when f.envelope ->> 'estado_publicacao' = 'bloqueado_frescor'
          then 'dados_desatualizados'
        when f.envelope ->> 'estado_publicacao' = 'em_auditoria'
          then 'em_auditoria'
        when o.ocorrencias_incompletas > 0 or o.conflitos > 0
          then 'em_auditoria'
        when o.denominador_observado = 0 then 'sem_base'
        else 'atualizados'
      end as dados_status_calculado
    from alvo_deterministico o
    cross join frescor f
  )
  select
    c.unidade_id,
    c.professor_id,
    c.aluno_id,
    p_data_inicio,
    p_data_fim,
    c.ocorrencias_observadas,
    c.denominador_observado,
    c.presentes_observados,
    c.faltas_observadas,
    c.faltas_justificadas_observadas,
    c.eventos_excluidos_observados,
    c.ocorrencias_incompletas,
    c.conflitos,
    case when c.estado_publicacao_calculado = 'publicavel'
      then c.denominador_observado else null end,
    case when c.estado_publicacao_calculado = 'publicavel'
      then c.presentes_observados else null end,
    case when c.estado_publicacao_calculado = 'publicavel'
      then c.faltas_observadas else null end,
    case when c.estado_publicacao_calculado = 'publicavel'
      then c.faltas_justificadas_observadas else null end,
    case when c.estado_publicacao_calculado = 'publicavel'
      then c.faltas_observadas + c.faltas_justificadas_observadas
      else null end,
    case
      when c.estado_publicacao_calculado = 'publicavel' then round(
        c.presentes_observados::numeric
          / nullif(c.denominador_observado, 0) * 100,
        2
      )
      else null
    end,
    c.dados_status_calculado,
    c.estado_publicacao_calculado,
    nullif(c.frescor ->> 'sincronizado_em', '')::timestamptz,
    'presenca-metricas-canonicas-v2.2'::text
  from classificada c
  order by c.professor_id, c.aluno_id;
end;
$function$;

revoke all on function public.get_presenca_metricas_canonicas_v2(
  uuid, date, date, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_metricas_canonicas_v2(
  uuid, date, date, integer, integer
) to service_role;

create or replace function public.get_presenca_ocorrencias_periodo_canonico_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_professor_id integer default null,
  p_aluno_id integer default null
)
returns table(
  slot_key text,
  aluno_id integer,
  aluno_nome text,
  unidade_id uuid,
  professor_id integer,
  professor_nome text,
  data_aula date,
  horario_aula time without time zone,
  curso_nome text,
  resultado_canonico text,
  fonte_decisao text,
  possui_conflito boolean,
  turma_nome text,
  sala_nome text,
  anotacoes text,
  duracao_minutos integer,
  tipo text,
  nr_da_aula integer,
  qtd_alunos integer,
  universo_eventos bigint,
  presentes bigint,
  faltas bigint,
  faltas_justificadas bigint,
  dados_status text,
  estado_publicacao text,
  sincronizado_em timestamp with time zone,
  regra_versao text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim
     or p_data_fim - p_data_inicio > 370 then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_OCORRENCIAS_PERIODO_INVALIDO';
  end if;

  return query
  with unidades_permitidas as materialized (
    select u.id as unidade_id
    from public.unidades u
    where (p_unidade_id is null or u.id = p_unidade_id)
      and (
        auth.role() = 'service_role'
        or session_user::text in ('postgres', 'service_role')
        or (
          auth.role() = 'authenticated'
          and (
            (select public.is_admin())
            or u.id in (select public.get_user_unidade_ids())
          )
        )
      )
  ), permitida as materialized (
    select o.*
    from unidades_permitidas u
    cross join lateral public.fn_presenca_ocorrencias_escopo_interno_v2(
      u.unidade_id,
      p_data_inicio,
      p_data_fim,
      p_professor_id,
      p_aluno_id
    ) o
  ), frescor as materialized (
    select
      u.unidade_id,
      public.fn_presenca_estado_publicacao_periodo_v2(
        u.unidade_id, p_data_inicio, p_data_fim
      ) as envelope
    from (select distinct p.unidade_id from permitida p) u
  ), enriquecida as (
    select
      p.*,
      a.nome::text as aluno_nome,
      pr.nome::text as professor_nome,
      ae.anotacoes::text,
      ae.duracao_minutos::integer,
      ae.tipo::text,
      ae.nr_da_aula::integer,
      ae.qtd_alunos::integer,
      f.envelope,
      count(*) filter (
        where p.resultado_canonico in (
          'presente', 'falta', 'falta_justificada'
        )
      ) over (partition by p.unidade_id)::bigint as universo_eventos,
      count(*) filter (where p.resultado_canonico = 'presente')
        over (partition by p.unidade_id)::bigint as presentes,
      count(*) filter (where p.resultado_canonico = 'falta')
        over (partition by p.unidade_id)::bigint as faltas,
      count(*) filter (where p.resultado_canonico = 'falta_justificada')
        over (partition by p.unidade_id)::bigint as faltas_justificadas
    from permitida p
    join public.alunos a on a.id = p.aluno_id
    left join public.professores pr on pr.id = p.professor_id
    left join lateral (
      select x.anotacoes, x.duracao_minutos, x.tipo, x.nr_da_aula,
             x.qtd_alunos
      from public.aulas_emusys x
      where x.id = any(p.ids_aulas_emusys)
      order by x.id
      limit 1
    ) ae on true
    join frescor f on f.unidade_id = p.unidade_id
  )
  select
    e.slot_key,
    e.aluno_id,
    e.aluno_nome,
    e.unidade_id,
    e.professor_id,
    e.professor_nome,
    e.data_aula,
    e.data_hora_inicio::time,
    e.curso_nome,
    e.resultado_canonico,
    e.fonte_decisao,
    e.possui_conflito,
    null::text as turma_nome,
    null::text as sala_nome,
    e.anotacoes,
    e.duracao_minutos,
    e.tipo,
    e.nr_da_aula,
    e.qtd_alunos,
    e.universo_eventos,
    e.presentes,
    e.faltas,
    e.faltas_justificadas,
    e.envelope ->> 'dados_status',
    case
      when e.envelope ->> 'estado_publicacao' = 'publicavel'
       and not e.possui_conflito
       and e.resultado_canonico <> 'indeterminado'
        then 'publicado'
      else 'em_auditoria'
    end,
    nullif(e.envelope ->> 'sincronizado_em', '')::timestamptz,
    e.ocorrencia_regra_versao || '+interface-consulta-v2.1'
  from enriquecida e
  order by e.data_aula, e.data_hora_inicio, e.aluno_nome, e.slot_key;
end;
$function$;

create or replace function public.get_health_score_professor_v3_presenca_periodo_v2(
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
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
#variable_conflict use_column
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_inicio date;
  v_fim_periodo date;
  v_fim_recorte date;
  v_codigo text;
begin
  if p_competencia is null or p_periodicidade not in ('mensal', 'ciclo') then
    raise exception 'HEALTH_SCORE_V3_PRESENCA_PERIODO_INVALIDO'
      using errcode = '22023';
  end if;

  select p.periodo_inicio, p.periodo_fim, p.ciclo_codigo
    into v_inicio, v_fim_periodo, v_codigo
  from public.fn_health_score_v3_periodo(p_competencia, p_periodicidade) p;

  v_fim_recorte := least(v_fim_periodo, current_date);

  return query
  with unidades_permitidas as materialized (
    select up.unidade_id
    from public.fn_health_score_v3_unidades_permitidas_sombra(p_unidade_id) up
  ), estado_unidade as materialized (
    select
      up.unidade_id,
      public.fn_presenca_estado_publicacao_periodo_v2(
        up.unidade_id, v_inicio, v_fim_recorte
      ) as estado
    from unidades_permitidas up
  ), observada as materialized (
    select
      o.professor_id,
      o.unidade_id,
      count(*) filter (
        where o.considera_frequencia_denominador
      )::integer as denominador_observado,
      count(*) filter (where o.considera_presenca)::integer
        as presentes_observados,
      count(*) filter (where o.considera_falta)::integer
        as faltas_observadas,
      count(*) filter (where o.considera_falta_justificada)::integer
        as faltas_justificadas_observadas,
      count(*) filter (where o.ocorrencia_incompleta)::integer
        as incompletas,
      count(*) filter (where o.possui_conflito)::integer as conflitos
    from unidades_permitidas up
    cross join lateral public.fn_presenca_ocorrencias_escopo_interno_v2(
      up.unidade_id,
      v_inicio,
      v_fim_recorte,
      null,
      null
    ) o
    group by o.professor_id, o.unidade_id
  ), alvo_unidade as (
    select distinct pu.professor_id, pu.unidade_id
    from public.professores_unidades pu
    join unidades_permitidas up on up.unidade_id = pu.unidade_id
    where coalesce(pu.emusys_ativo, true)
      and coalesce(pu.validacao_status, 'validado')
        not in ('ignorado', 'rejeitado')
    union
    select distinct o.professor_id, o.unidade_id
    from observada o
    where o.professor_id is not null
  ), por_professor as (
    select
      a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
        as unidade_saida,
      sum(coalesce(o.denominador_observado, 0))::integer
        as denominador_observado,
      sum(coalesce(o.presentes_observados, 0))::integer
        as presentes_observados,
      sum(coalesce(o.faltas_observadas, 0))::integer as faltas_observadas,
      sum(coalesce(o.faltas_justificadas_observadas, 0))::integer
        as faltas_justificadas_observadas,
      sum(coalesce(o.incompletas, 0))::integer as incompletas,
      sum(coalesce(o.conflitos, 0))::integer as conflitos,
      bool_or(e.estado ->> 'estado_publicacao' = 'bloqueado_roster')
        as bloqueado_roster,
      bool_or(e.estado ->> 'estado_publicacao' = 'bloqueado_frescor')
        as bloqueado_frescor,
      bool_or(e.estado ->> 'estado_publicacao' = 'em_auditoria')
        as em_auditoria,
      bool_and(e.estado ->> 'estado_publicacao' in ('publicavel', 'sem_base'))
        as unidades_resolvidas,
      max(nullif(e.estado ->> 'sincronizado_em', '')::timestamptz)
        as sincronizado_em
    from alvo_unidade a
    join estado_unidade e on e.unidade_id = a.unidade_id
    left join observada o
      on o.professor_id = a.professor_id and o.unidade_id = a.unidade_id
    group by a.professor_id,
      case when p_unidade_id is null then null::uuid else a.unidade_id end
  ), classificada as (
    select
      p.*,
      case
        when p.bloqueado_roster then 'bloqueado_roster'
        when p.bloqueado_frescor then 'bloqueado_frescor'
        when p.em_auditoria or p.incompletas > 0 or p.conflitos > 0
          then 'em_auditoria'
        when p.denominador_observado = 0 then 'sem_base'
        when p.denominador_observado < 10 then 'sem_base_amostra'
        else 'ok'
      end as estado_base_calculado,
      p.unidades_resolvidas
        and not p.bloqueado_roster
        and not p.bloqueado_frescor
        and not p.em_auditoria
        and p.incompletas = 0
        and p.conflitos = 0
        and p.denominador_observado >= 10 as publicavel_calculado
    from por_professor p
  )
  select
    'presenca'::text,
    c.professor_id,
    pr.nome::text,
    c.unidade_saida,
    v_competencia,
    case when c.publicavel_calculado then round(
      c.presentes_observados::numeric / c.denominador_observado * 100,
      2
    ) else null end,
    case when c.publicavel_calculado
      then c.presentes_observados::numeric else null end,
    case when c.publicavel_calculado
      then c.denominador_observado::numeric else null end,
    case when c.publicavel_calculado
      then c.denominador_observado else null end,
    c.estado_base_calculado,
    c.publicavel_calculado,
    case
      when c.publicavel_calculado then 'alta'
      when c.estado_base_calculado = 'sem_base' then 'sem_base'
      when c.estado_base_calculado = 'sem_base_amostra' then 'baixa'
      else 'auditoria'
    end,
    'vw_presenca_ocorrencia_canonica_v2'::text,
    'health-score-professor-v3-presenca-v2.2'::text,
    case c.estado_base_calculado
      when 'bloqueado_roster' then 'roster incompleto ou em revisao no periodo'
      when 'bloqueado_frescor' then 'sincronizacao incompleta no periodo'
      when 'em_auditoria' then 'ocorrencia pendente ou conflitante no periodo'
      when 'sem_base' then 'nenhuma ocorrencia confirmada no periodo'
      when 'sem_base_amostra' then 'base minima de 10 eventos nao atingida'
      else null
    end,
    jsonb_build_object(
      'periodicidade', p_periodicidade,
      'periodo_inicio', v_inicio,
      'periodo_fim', v_fim_periodo,
      'fim_recorte', v_fim_recorte,
      'ciclo_codigo', v_codigo,
      'denominador_observado', c.denominador_observado,
      'presentes_observados', c.presentes_observados,
      'faltas_observadas', c.faltas_observadas,
      'faltas_justificadas_observadas',
        c.faltas_justificadas_observadas,
      'faltas_total_observado',
        c.faltas_observadas + c.faltas_justificadas_observadas,
      'ocorrencias_incompletas', c.incompletas,
      'conflitos', c.conflitos,
      'estado_publicacao', c.estado_base_calculado,
      'sincronizado_em', c.sincronizado_em,
      'fonte_veredito', 'vw_presenca_ocorrencia_canonica_v2',
      'apta_oficial', c.publicavel_calculado
        and p_periodicidade = 'ciclo'
        and v_fim_periodo <= current_date
    )
  from classificada c
  join public.professores pr on pr.id = c.professor_id;
end;
$function$;
