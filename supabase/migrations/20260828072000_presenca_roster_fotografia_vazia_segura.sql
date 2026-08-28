-- Uma coleta Emusys completa pode legitimamente devolver zero aulas (domingo,
-- feriado ou unidade fechada). O nucleo anterior tratava esse caso como falha
-- mesmo quando nao havia base local a conciliar. Mantemos fail-closed: vazio
-- so conclui sem mutacao quando a base local regular tambem esta vazia.

begin;

create or replace function public.reconciliar_grade_snapshot_emusys_core_v4(
  p_run_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) > 0 then
    return public.reconciliar_grade_snapshot_emusys_core_v3(
      p_run_id, p_unidade_id, p_data_inicio, p_data_fim,
      p_snapshot, p_dry_run
    );
  end if;

  if p_run_id is null or p_unidade_id is null or p_data_inicio is null
     or p_data_fim is null or p_data_fim < p_data_inicio or p_dry_run is null
     or p_data_inicio < v_hoje - 120 or p_data_fim > v_hoje + 60 then
    return public.reconciliar_grade_snapshot_emusys_core_v3(
      p_run_id, p_unidade_id, p_data_inicio, p_data_fim,
      p_snapshot, p_dry_run
    );
  end if;

  if exists (
    select 1
      from public.aulas_emusys a
     where a.unidade_id = p_unidade_id
       and a.data_aula between p_data_inicio and p_data_fim
       and coalesce(a.categoria, 'normal') = 'normal'
  ) then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_vazia_com_base_local',
      'dry_run', p_dry_run,
      'run_id', p_run_id,
      'unidade_id', p_unidade_id,
      'estados_gravados', 0,
      'vinculos_reativados', 0,
      'vinculos_inativados', 0,
      'vinculos_removidos', 0,
      'vinculos_removidos_aplicados', 0,
      'aulas_canceladas', 0,
      'aulas_canceladas_aplicadas', 0,
      'alteracoes_aplicadas', 0,
      'detalhe', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'motivo', 'fotografia_vazia_sem_base_local',
    'dry_run', p_dry_run,
    'run_id', p_run_id,
    'unidade_id', p_unidade_id,
    'estados_gravados', 0,
    'vinculos_reativados', 0,
    'vinculos_inativados', 0,
    'vinculos_removidos', 0,
    'vinculos_removidos_aplicados', 0,
    'aulas_canceladas', 0,
    'aulas_canceladas_aplicadas', 0,
    'alteracoes_aplicadas', 0,
    'detalhe', '[]'::jsonb
  );
end;
$function$;

revoke all on function public.reconciliar_grade_snapshot_emusys_core_v4(
  uuid, uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;

create or replace function public.reconciliar_grade_snapshot_emusys_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  return public.reconciliar_grade_snapshot_emusys_core_v4(
    gen_random_uuid(), p_unidade_id, p_data_inicio, p_data_fim,
    p_snapshot, p_dry_run
  );
end;
$function$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) to service_role;

create or replace function public.reconciliar_grade_snapshot_emusys_v2(
  p_sync_run_id uuid,
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_exec public.presenca_sync_execucoes%rowtype;
  v_cobertura public.presenca_sync_cobertura%rowtype;
  v_resultado jsonb;
  v_estados_esperados integer;
  v_estados_encontrados integer;
  v_vinculos_esperados integer;
  v_vinculos_encontrados integer;
  v_contagem_inconsistente boolean;
  v_lock_key bigint;
begin
  if p_sync_run_id is null or p_unidade_id is null
     or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio or p_dry_run is null then
    raise exception using errcode = '22023', message = 'sync_run_incompativel';
  end if;

  if not p_dry_run then
    for v_lock_key in
      select distinct locks.lock_key
        from (
          select public.fn_presenca_roster_lock_key_v2(a.id) as lock_key
            from public.aulas_emusys a
           where a.unidade_id = p_unidade_id
             and a.data_aula between p_data_inicio and p_data_fim
          union all
          select public.fn_presenca_slot_lock_key_v2(
            a.unidade_id, a.professor_id, a.data_hora_inicio,
            a.data_hora_fim, a.curso_nome
          ) as lock_key
            from public.aulas_emusys a
           where a.unidade_id = p_unidade_id
             and a.data_aula between p_data_inicio and p_data_fim
        ) locks
       order by locks.lock_key
    loop
      perform pg_advisory_xact_lock(v_lock_key);
    end loop;
  end if;

  select x.*
    into v_exec
    from public.presenca_sync_execucoes x
   where x.id = p_sync_run_id
   for update;

  if not found
     or v_exec.unidade_id is distinct from p_unidade_id
     or v_exec.modo not in ('presenca', 'metadados', 'agenda')
     or v_exec.data_alvo not between p_data_inicio and p_data_fim
     or v_exec.status <> 'iniciada'
     or v_exec.snapshot_hash is not null then
    raise exception using errcode = '22023', message = 'sync_run_incompativel';
  end if;

  select c.*
    into v_cobertura
    from public.presenca_sync_cobertura c
   where c.unidade_id = v_exec.unidade_id
     and c.modo = v_exec.modo
     and c.data_alvo = v_exec.data_alvo
   for update;

  if not found
     or v_cobertura.run_id is distinct from p_sync_run_id
     or v_cobertura.status <> 'iniciada'
     or v_cobertura.snapshot_hash is not null
     or v_cobertura.lease_ate is null
     or v_cobertura.lease_ate <= clock_timestamp()
     or v_cobertura.paginas_lidas <> v_exec.paginas_lidas
     or v_cobertura.aulas_lidas <> v_exec.aulas_lidas
     or v_cobertura.presencas_lidas <> v_exec.presencas_lidas then
    raise exception using errcode = '40001', message = 'sync_run_substituida';
  end if;

  v_resultado := public.reconciliar_grade_snapshot_emusys_core_v4(
    p_sync_run_id, p_unidade_id, p_data_inicio, p_data_fim,
    p_snapshot, p_dry_run
  );

  if coalesce(v_resultado ->> 'status', '') <> 'ok' then
    return v_resultado || jsonb_build_object(
      'run_id', p_sync_run_id,
      'contrato', 'roster_v2'
    );
  end if;
  if p_dry_run then
    return v_resultado || jsonb_build_object(
      'run_id', p_sync_run_id,
      'contrato', 'roster_v2'
    );
  end if;

  v_estados_esperados := coalesce(
    (v_resultado ->> 'estados_gravados')::integer, 0
  );

  with estados as materialized (
    select e.aula_id, e.unidade_id, e.estado, e.qtd_recebida
      from public.aula_roster_sync_estado e
      join public.aulas_emusys a on a.id = e.aula_id
     where e.run_id = p_sync_run_id
       and e.unidade_id = p_unidade_id
       and a.unidade_id = p_unidade_id
       and a.data_aula between p_data_inicio and p_data_fim
  ), vinculos as materialized (
    select aa.aula_emusys_id, aa.unidade_id, count(*)::integer as quantidade
      from public.aula_alunos_emusys aa
     where aa.ativo_operacional
       and aa.ultimo_run_visto = p_sync_run_id
     group by aa.aula_emusys_id, aa.unidade_id
  )
  select
    count(*)::integer,
    coalesce(sum(e.qtd_recebida) filter (where e.estado = 'completo'), 0)::integer,
    coalesce(sum(v.quantidade) filter (where e.estado = 'completo'), 0)::integer,
    coalesce(bool_or(
      e.estado = 'completo'
      and coalesce(v.quantidade, 0) <> e.qtd_recebida
    ), false)
    into v_estados_encontrados, v_vinculos_esperados,
         v_vinculos_encontrados, v_contagem_inconsistente
    from estados e
    left join vinculos v
      on v.aula_emusys_id = e.aula_id
     and v.unidade_id = e.unidade_id;

  if v_estados_encontrados <> v_estados_esperados
     or v_vinculos_encontrados <> v_vinculos_esperados
     or v_contagem_inconsistente then
    raise exception using errcode = '40001', message = 'roster_contagem_concorrente';
  end if;

  return v_resultado || jsonb_build_object(
    'run_id', p_sync_run_id,
    'contrato', 'roster_v2'
  );
end;
$function$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) to service_role;

comment on function public.reconciliar_grade_snapshot_emusys_core_v4(
  uuid, uuid, date, date, jsonb, boolean
) is
  'Nucleo v4: fotografia vazia so conclui sem mutacao quando nao existe base local regular.';
comment on function public.reconciliar_grade_snapshot_emusys_v1(
  uuid, date, date, jsonb, boolean
) is
  'Compatibilidade v1 sobre nucleo v4; vazio seguro e base local preservada.';
comment on function public.reconciliar_grade_snapshot_emusys_v2(
  uuid, uuid, date, date, jsonb, boolean
) is
  'Roster v2 governado sobre nucleo v4; fotografia vazia continua fail-closed com base local.';

commit;
