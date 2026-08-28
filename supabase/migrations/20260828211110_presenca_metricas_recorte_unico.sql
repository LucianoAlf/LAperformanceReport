-- Reutiliza o mesmo recorte canonico para numeros e estado de publicacao.

CREATE OR REPLACE FUNCTION public.get_presenca_metricas_canonicas_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_professor_id integer DEFAULT NULL::integer, p_aluno_id integer DEFAULT NULL::integer)
 RETURNS TABLE(unidade_id uuid, professor_id integer, aluno_id integer, periodo_inicio date, periodo_fim date, ocorrencias_observadas bigint, denominador_observado bigint, presentes_observados bigint, faltas_observadas bigint, faltas_justificadas_observadas bigint, eventos_excluidos_observados bigint, ocorrencias_incompletas bigint, conflitos bigint, denominador bigint, presentes bigint, faltas bigint, faltas_justificadas bigint, faltas_total bigint, percentual_presenca numeric, dados_status text, estado_publicacao text, sincronizado_em timestamp with time zone, regra_versao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
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
  with ocorrencias as materialized (
    select *
    from public.fn_presenca_ocorrencias_escopo_interno_v2(
      p_unidade_id,
      p_data_inicio,
      p_data_fim,
      p_professor_id,
      p_aluno_id
    )
  ), observada as materialized (
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
      count(*) filter (
        where o.considera_falta_justificada
      )::bigint as faltas_justificadas_observadas,
      count(*) filter (
        where o.resultado_canonico in (
          'aula_cancelada', 'aula_justificada'
        )
      )::bigint as eventos_excluidos_observados,
      count(*) filter (where o.ocorrencia_incompleta)::bigint
        as ocorrencias_incompletas,
      count(*) filter (where o.possui_conflito)::bigint as conflitos
    from ocorrencias o
    group by o.unidade_id, o.professor_id, o.aluno_id
  ), alvo_deterministico as materialized (
    select o.*
    from observada o

    union all

    select
      p_unidade_id,
      p_professor_id,
      p_aluno_id,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint
    where not exists (select 1 from observada)
  ), dias_operacionais as materialized (
    select distinct ae.data_aula
    from public.aulas_emusys ae
    where ae.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and ae.data_hora_fim < clock_timestamp()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
  ), frescor_por_dia as materialized (
    select
      d.data_aula,
      case
        when v_role = 'service_role'
          or session_user::text in ('postgres', 'service_role')
          then public.fn_presenca_dados_frescos_v1(
            p_unidade_id,
            d.data_aula
          )
        else public.fn_presenca_dados_frescos_interno_v1(
          p_unidade_id,
          d.data_aula
        )
      end as frescor
    from dias_operacionais d
  ), revisao_por_dia as materialized (
    select
      d.data_aula,
      exists (
        select 1
        from public.aulas_emusys ae
        left join public.aula_roster_sync_estado re
          on re.aula_id = ae.id
        where ae.unidade_id = p_unidade_id
          and ae.data_aula = d.data_aula
          and ae.data_hora_fim < now()
          and coalesce(ae.categoria, 'normal') = 'normal'
          and not coalesce(ae.cancelada, false)
          and ae.professor_id is not null
          and (
            coalesce(re.estado, 'sem_fotografia') in (
              'incompleto', 'ambiguo', 'sem_fotografia'
            )
            or re.sincronizado_em is null
            or re.sincronizado_em
              < (d.data_aula::timestamp at time zone 'America/Sao_Paulo')
            or (
              nullif(f.frescor ->> 'finalizada_em', '')::timestamptz
                is not null
              and re.sincronizado_em
                > nullif(f.frescor ->> 'finalizada_em', '')::timestamptz
            )
          )
      ) as tem_revisao
    from dias_operacionais d
    join frescor_por_dia f using (data_aula)
  ), estado_por_dia as materialized (
    select
      d.data_aula,
      nullif(f.frescor ->> 'finalizada_em', '')::timestamptz
        as sincronizado_em,
      r.tem_revisao,
      case
        when coalesce(
          (f.frescor ->> 'publicavel')::boolean,
          false
        ) is not true then 'dados_desatualizados'
        when r.tem_revisao then 'roster_em_revisao'
        else 'atualizados'
      end as dados_status
    from dias_operacionais d
    join frescor_por_dia f using (data_aula)
    join revisao_por_dia r using (data_aula)
  ), candidatos as materialized (
    select
      public.fn_presenca_slot_key_v2(
        r.aluno_id,
        ae.unidade_id,
        ae.professor_id,
        ae.data_hora_inicio,
        ae.data_hora_fim,
        ae.curso_nome
      ) as slot_key,
      r.aluno_id,
      ae.unidade_id,
      ae.data_aula,
      row_number() over (
        partition by
          r.aluno_id,
          ae.unidade_id,
          ae.professor_id,
          ae.data_hora_inicio,
          ae.data_hora_fim,
          lower(btrim(coalesce(ae.curso_nome, '')))
        order by
          nullif(ae.matricula_disciplina_id, 0) nulls last,
          case when ae.tipo = 'turma' then 0 else 1 end,
          ae.id
      ) as posicao
    from public.vw_aula_roster_operacional_v1 r
    join public.aulas_emusys ae
      on ae.id = r.aula_emusys_id
    join dias_operacionais d
      on d.data_aula = ae.data_aula
    where ae.unidade_id = p_unidade_id
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and ae.professor_id is not null
      and public.fn_presenca_pendencia_elegivel(
        ae.unidade_id,
        r.aluno_id,
        ae.data_aula,
        ae.matricula_disciplina_id,
        ae.curso_nome
      )
      and not exists (
        select 1
        from public.aulas_emusys g
        where g.unidade_id = ae.unidade_id
          and g.professor_id = ae.professor_id
          and g.data_hora_inicio = ae.data_hora_inicio
          and g.data_hora_fim = ae.data_hora_fim
          and lower(btrim(coalesce(g.curso_nome, '')))
            = lower(btrim(coalesce(ae.curso_nome, '')))
          and (
            coalesce(g.cancelada, false)
            or coalesce(g.justificada, false)
          )
      )
  ), respostas_por_dia as materialized (
    select
      c.data_aula,
      count(*) filter (
        where coalesce(o.fecha_chamada, false) = false
          and not coalesce(o.possui_conflito, false)
      )::integer as pendencias,
      count(*) filter (
        where coalesce(o.possui_conflito, false)
      )::integer as conflitos
    from candidatos c
    join public.alunos al
      on al.id = c.aluno_id
    left join ocorrencias o
      on o.slot_key = c.slot_key
     and o.unidade_id = c.unidade_id
     and o.data_aula = c.data_aula
    where c.posicao = 1
    group by c.data_aula
  ), resumo as materialized (
    select
      count(*)::integer as dias_operacionais,
      count(*) filter (
        where e.dados_status = 'atualizados'
          and coalesce(r.pendencias, 0) = 0
          and coalesce(r.conflitos, 0) = 0
      )::integer as dias_publicaveis,
      count(*) filter (
        where e.dados_status = 'dados_desatualizados'
      )::integer as dias_desatualizados,
      count(*) filter (
        where e.dados_status = 'roster_em_revisao'
          or e.tem_revisao
      )::integer as dias_roster_em_revisao,
      count(*) filter (
        where e.dados_status = 'atualizados'
          and coalesce(r.pendencias, 0) > 0
      )::integer as dias_com_pendencias,
      count(*) filter (
        where e.dados_status = 'atualizados'
          and coalesce(r.conflitos, 0) > 0
      )::integer as dias_com_conflitos,
      max(e.sincronizado_em) as sincronizado_em
    from estado_por_dia e
    left join respostas_por_dia r using (data_aula)
  ), frescor as materialized (
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
      'sincronizado_em', r.sincronizado_em
    ) as envelope
    from resumo r
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

comment on function public.get_presenca_metricas_canonicas_v2(
  uuid, date, date, integer, integer
) is 'Metricas v2.2 com um unico recorte canonico compartilhado entre numeros e publicacao.';
