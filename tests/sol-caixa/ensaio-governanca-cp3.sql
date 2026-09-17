\set ON_ERROR_STOP on

do $$
declare
  v_ep text := 'ep1.k1.' || repeat('a',64);
  v_r jsonb;
begin
  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('1',64),
    'event_type','relevance_decided','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('relevance','irrelevant','reason_code','standby','outcome','contained')
  )) into v_r;
  if not coalesce((v_r->>'ok')::boolean,false) then
    raise exception 'relevance_decided válido foi recusado: %', v_r;
  end if;

  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('2',64),
    'event_type','contained_with_reason','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('route','contained','engine','bridge','reason_code','standby','outcome','contained')
  )) into v_r;
  if not coalesce((v_r->>'ok')::boolean,false) then
    raise exception 'contained_with_reason válido foi recusado: %', v_r;
  end if;

  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('3',64),
    'event_type','relevance_decided','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('relevance','irrelevant','raw_text','nao_pode')
  )) into v_r;
  if coalesce((v_r->>'ok')::boolean,true) then
    raise exception 'campo bruto foi aceito pelo CP3';
  end if;

  if (select count(*) from public.sol_caixa_governanca_eventos_v1
       where event_type in ('relevance_decided','contained_with_reason')) <> 2 then
    raise exception 'eventos CP3 não foram persistidos exatamente uma vez';
  end if;

  if has_table_privilege('anon', 'public.sol_caixa_governanca_eventos_v1', 'select')
     or has_table_privilege('authenticated', 'public.sol_caixa_governanca_eventos_v1', 'select') then
    raise exception 'CP3 ampliou SELECT direto indevidamente';
  end if;
end $$;

select 'governança CP3: relevância, contenção, sanitização e ACL OK' as resultado;
