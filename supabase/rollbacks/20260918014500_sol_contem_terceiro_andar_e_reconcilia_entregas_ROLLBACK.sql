-- Rollback exato da contenção do Terceiro Andar.
-- Restaura somente as linhas capturadas antes da aplicação. Eventos posteriores
-- não são reescritos. Não executar sem gate, pois reativa egress proativo.

do $rollback$
declare
  v_run public.sol_terceiro_andar_contencao_auditoria_v1%rowtype;
  v_item jsonb;
begin
  select * into v_run
    from public.sol_terceiro_andar_contencao_auditoria_v1
   where controle_ref = 'third_floor_containment_v1'
     and rolled_back_at is null
   order by captured_at desc
   limit 1
   for update;

  if v_run.run_id is null then
    raise exception 'TERCEIRO_ANDAR_ROLLBACK_SEM_SNAPSHOT_ATIVO';
  end if;

  for v_item in select value from jsonb_array_elements(v_run.switches) loop
    update public.automacoes_config
       set ativo = (v_item->>'ativo')::boolean,
           updated_at = (v_item->>'updated_at')::timestamptz
     where slug = v_item->>'slug';
    if not found then
      raise exception 'TERCEIRO_ANDAR_ROLLBACK_SWITCH_AUSENTE slug=%', v_item->>'slug';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(v_run.recipients) loop
    update public.radar_destinatarios
       set ativo = (v_item->>'ativo')::boolean
     where id = (v_item->>'id')::uuid;
    if not found then
      raise exception 'TERCEIRO_ANDAR_ROLLBACK_DESTINATARIO_AUSENTE id=%', v_item->>'id';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(v_run.deliveries) loop
    update public.radar_entregas
       set status = v_item->>'status',
           erro = nullif(v_item->>'erro', ''),
           enviado_em = nullif(v_item->>'enviado_em', '')::timestamptz
     where id = (v_item->>'id')::uuid;
    if not found then
      raise exception 'TERCEIRO_ANDAR_ROLLBACK_ENTREGA_AUSENTE id=%', v_item->>'id';
    end if;
  end loop;

  update public.sol_terceiro_andar_contencao_auditoria_v1
     set rolled_back_at = now()
   where run_id = v_run.run_id;
end
$rollback$;

drop trigger if exists tr_sol_sincronizar_radar_entrega_da_fila_v1
  on public.fila_relatorios_sol_hermes;
drop function if exists public.sol_sincronizar_radar_entrega_da_fila_v1();
