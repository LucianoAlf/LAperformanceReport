-- Serializa todos os modos que escrevem o espelho Emusys por unidade.
-- A lease anterior era unidade/modo/data e permitia que metadados e presenca
-- alterassem o mesmo slot simultaneamente.

begin;

create or replace function public.presenca_sync_iniciar_v1(
  p_unidade_id uuid,
  p_modo text,
  p_data_alvo date,
  p_request_id uuid,
  p_lease_segundos integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_existente public.presenca_sync_execucoes%rowtype;
  v_cobertura public.presenca_sync_cobertura%rowtype;
  v_ativa_unidade public.presenca_sync_cobertura%rowtype;
  v_run_id uuid;
  v_agora timestamptz := clock_timestamp();
  v_motivo text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_alvo is null or p_request_id is null
     or p_modo not in ('presenca', 'metadados', 'agenda')
     or p_lease_segundos not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'parametros de sync invalidos';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'presenca_sync_unidade:' || p_unidade_id::text,
    20260828064000
  ));

  select * into v_existente
    from public.presenca_sync_execucoes
   where request_id = p_request_id
     and unidade_id = p_unidade_id
     and modo = p_modo
     and data_alvo = p_data_alvo;
  if found then
    insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
    values (v_existente.id, 'deduplicada', jsonb_build_object('motivo', 'request_id_repetido'));
    return jsonb_build_object(
      'adquirida', false, 'motivo', 'request_id_repetido',
      'run_id', v_existente.id, 'status', v_existente.status
    );
  end if;

  select * into v_ativa_unidade
    from public.presenca_sync_cobertura
   where unidade_id = p_unidade_id
     and status = 'iniciada'
     and lease_ate > v_agora
   order by lease_ate desc, iniciada_em desc
   limit 1
   for update;

  if found then
    v_motivo := case
      when v_ativa_unidade.modo = p_modo
       and v_ativa_unidade.data_alvo = p_data_alvo
        then 'lease_ativo'
      else 'lease_unidade_ativo'
    end;

    -- Outro modo/data precisa poder repetir com o mesmo request_id assim que a
    -- unidade for liberada. Nao persistimos uma falsa execucao terminal aqui.
    if v_motivo = 'lease_unidade_ativo' then
      return jsonb_build_object(
        'adquirida', false, 'motivo', v_motivo,
        'run_ativo', v_ativa_unidade.run_id,
        'lease_ate', v_ativa_unidade.lease_ate
      );
    end if;

    insert into public.presenca_sync_execucoes(
      request_id, unidade_id, modo, data_alvo, status, erro_codigo,
      lease_segundos, finalizada_em
    ) values (
      p_request_id, p_unidade_id, p_modo, p_data_alvo, 'abortada',
      'LEASE_ATIVO',
      p_lease_segundos, v_agora
    ) returning id into v_run_id;

    insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
    values (v_run_id, 'deduplicada', jsonb_build_object(
      'motivo', v_motivo,
      'run_ativo', v_ativa_unidade.run_id,
      'modo_ativo', v_ativa_unidade.modo,
      'data_ativa', v_ativa_unidade.data_alvo
    ));
    return jsonb_build_object(
      'adquirida', false, 'motivo', v_motivo,
      'run_id', v_run_id, 'run_ativo', v_ativa_unidade.run_id
    );
  end if;

  select * into v_cobertura
    from public.presenca_sync_cobertura
   where unidade_id = p_unidade_id and modo = p_modo and data_alvo = p_data_alvo
   for update;

  if found and v_cobertura.status = 'iniciada' then
    update public.presenca_sync_execucoes
       set status = 'abortada', erro_codigo = 'LEASE_EXPIRADA', finalizada_em = v_agora
     where id = v_cobertura.run_id and status = 'iniciada';
    if found then
      insert into public.presenca_sync_eventos(run_id, tipo, detalhes)
      values (v_cobertura.run_id, 'abortada', jsonb_build_object('motivo', 'lease_expirada'));
    end if;
  end if;

  insert into public.presenca_sync_execucoes(
    request_id, unidade_id, modo, data_alvo, status, lease_segundos, heartbeat_em
  ) values (
    p_request_id, p_unidade_id, p_modo, p_data_alvo, 'iniciada', p_lease_segundos, v_agora
  ) returning id into v_run_id;

  insert into public.presenca_sync_cobertura(
    unidade_id, modo, data_alvo, run_id, status, lease_ate, heartbeat_em,
    snapshot_hash, paginas_lidas, aulas_lidas, presencas_lidas,
    iniciada_em, finalizada_em, atualizada_em
  ) values (
    p_unidade_id, p_modo, p_data_alvo, v_run_id, 'iniciada',
    v_agora + make_interval(secs => p_lease_segundos), v_agora,
    null, 0, 0, 0, v_agora, null, v_agora
  ) on conflict (unidade_id, modo, data_alvo) do update set
    run_id = excluded.run_id,
    status = excluded.status,
    lease_ate = excluded.lease_ate,
    heartbeat_em = excluded.heartbeat_em,
    snapshot_hash = null,
    paginas_lidas = 0,
    aulas_lidas = 0,
    presencas_lidas = 0,
    iniciada_em = excluded.iniciada_em,
    finalizada_em = null,
    atualizada_em = excluded.atualizada_em;

  insert into public.presenca_sync_eventos(run_id, tipo)
  values (v_run_id, 'iniciada');
  return jsonb_build_object('adquirida', true, 'run_id', v_run_id, 'status', 'iniciada');
end;
$function$;

revoke all on function public.presenca_sync_iniciar_v1(uuid, text, date, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.presenca_sync_iniciar_v1(uuid, text, date, uuid, integer)
  to service_role;

comment on function public.presenca_sync_iniciar_v1(uuid, text, date, uuid, integer) is
  'Adquire lease exclusiva por unidade para presenca, metadados e agenda; service_role only.';

commit;
