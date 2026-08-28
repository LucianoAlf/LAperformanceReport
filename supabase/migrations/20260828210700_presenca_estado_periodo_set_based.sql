-- Resume o estado de publicacao em um unico recorte canonico por periodo.
-- Preserva o envelope v2.2 e evita montar listas nominais completas para cada dia.

CREATE OR REPLACE FUNCTION public.fn_presenca_estado_publicacao_periodo_v2(p_unidade_id uuid, p_data_inicio date, p_data_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare
  v_role text := coalesce(auth.role(), '');
  v_resultado jsonb;
begin
  if p_unidade_id is null
     or p_data_inicio is null
     or p_data_fim is null
     or p_data_inicio > p_data_fim then
    raise exception using
      errcode = '22023',
      message = 'PRESENCA_PUBLICACAO_PERIODO_INVALIDO';
  end if;

  if v_role <> 'service_role' and session_user::text not in (
    'postgres', 'service_role',
    'sol_acesso_restrito', 'lia_acesso_restrito', 'mila_acesso_restrito'
  ) then
    if v_role <> 'authenticated'
       or not (
         (select public.is_admin())
         or p_unidade_id in (select public.get_user_unidade_ids())
       ) then
      raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
    end if;
  end if;

  with dias_operacionais as materialized (
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
  ), ocorrencias as materialized (
    select
      o.slot_key,
      o.unidade_id,
      o.data_aula,
      o.fecha_chamada,
      o.possui_conflito
    from public.fn_presenca_ocorrencias_escopo_interno_v2(
      p_unidade_id,
      p_data_inicio,
      p_data_fim,
      null,
      null
    ) o
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
      ae.professor_id,
      ae.data_aula,
      ae.data_hora_inicio,
      ae.data_hora_fim,
      ae.curso_nome,
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
  ), resumo as (
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
  into v_resultado
  from resumo r;

  return v_resultado;
end;
$function$;

revoke all on function public.fn_presenca_estado_publicacao_periodo_v2(
  uuid, date, date
) from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_estado_publicacao_periodo_v2(
  uuid, date, date
) to authenticated, service_role;

comment on function public.fn_presenca_estado_publicacao_periodo_v2(
  uuid, date, date
) is 'Estado de publicacao v2.2 set-based: preserva o envelope diario sem remontar listas por dia.';
