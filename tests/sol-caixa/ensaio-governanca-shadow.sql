\set ON_ERROR_STOP on

-- Stub do escritor estreito do control plane da Sol. Em produção esta função
-- já pertence ao schema de governança; o ensaio mantém o banco isolado.
create or replace function public.sol_governanca_writer_autorizado_v1(
  p_token_id text,
  p_writer_token text
) returns boolean
language sql
stable
as $$
  select p_token_id = 'writer-ensaio' and p_writer_token = 'token-escritor-ensaio';
$$;

do $$
declare
  v_ep text := 'ep1.k1.' || repeat('a',64);
  v_ev text := 'evt1.k1.' || repeat('b',64);
  v_r jsonb;
begin
  select public.sol_caixa_governanca_registrar_v2(
    'writer-ensaio','token-escritor-ensaio',jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key',v_ev,
    'event_type','message_observed','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('media_kind','text','duplicate',false)
  )) into v_r;
  if not coalesce((v_r->>'ok')::boolean,false) then raise exception 'registro válido recusado: %',v_r; end if;

  begin
    perform public.sol_caixa_governanca_registrar_v2(
      'writer-ensaio','token-incorreto',jsonb_build_object(
        'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('f',64),
        'event_type','route_decided','occurred_at',now(),'unit_code','recreio',
        'source','whatsapp_group','message_kind','text','key_id','k1','details','{}'::jsonb
      ));
    raise exception 'token incorreto foi aceito';
  exception when insufficient_privilege then null;
  end;

  if not has_function_privilege('anon', 'public.sol_caixa_governanca_registrar_v2(text,text,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.sol_caixa_governanca_registrar_v1(jsonb)', 'execute') then
    raise exception 'grants do escritor estreito estão incorretos';
  end if;

  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key',v_ev,
    'event_type','message_observed','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1','details','{}'::jsonb
  )) into v_r;
  if coalesce((v_r->>'inserted')::boolean,true) then raise exception 'dedupe não foi idempotente'; end if;

  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('c',64),
    'event_type','tool_selected','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('raw_text','segredo')
  )) into v_r;
  if coalesce((v_r->>'ok')::boolean,true) then raise exception 'campo bruto foi aceito'; end if;

  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('e',64),
    'event_type','write_refused','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('reason_code','texto humano não pode atravessar')
  )) into v_r;
  if coalesce((v_r->>'ok')::boolean,true) then raise exception 'texto em valor permitido foi aceito'; end if;

  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('d',64),
    'event_type','redelivery_observed','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('duplicate',true)
  )) into v_r;
  select public.sol_caixa_governanca_registrar_v1(jsonb_build_object(
    'schema_version',1,'episode_id',v_ep,'event_key','evt1.k1.'||repeat('d',64),
    'event_type','redelivery_observed','occurred_at',now(),'unit_code','recreio',
    'source','whatsapp_group','message_kind','text','key_id','k1',
    'details',jsonb_build_object('duplicate',true)
  )) into v_r;
  if (select redelivery_count from public.sol_caixa_governanca_episodios_v1 where episode_id = v_ep) <> 1 then
    raise exception 'redelivery foi contada mais de uma vez';
  end if;

  select public.sol_caixa_governanca_podar_v1(6) into v_r;
  if coalesce((v_r->>'ok')::boolean,true) then raise exception 'retenção abaixo de 7 dias foi aceita'; end if;

  if (select count(*) from public.sol_caixa_governanca_episodios_v1) <> 1
     or (select count(*) from public.sol_caixa_governanca_eventos_v1) <> 2 then
    raise exception 'contagens inesperadas';
  end if;

  select public.sol_caixa_governanca_readback_v1(
    'writer-ensaio', 'token-escritor-ensaio', now() - interval '1 hour', now() + interval '1 minute', 10
  ) into v_r;
  if v_r->>'ok' <> 'true'
     or (v_r#>>'{counts,events}')::integer <> 2
     or (v_r#>>'{counts,episodes}')::integer <> 1
     or (v_r#>>'{counts,open_episodes}')::integer <> 1
     or jsonb_array_length(v_r->'events') <> 2
     or jsonb_array_length(v_r->'episodes') <> 1 then
    raise exception 'readback válido não reconciliou: %', v_r;
  end if;

  begin
    perform public.sol_caixa_governanca_readback_v1(
      'writer-ensaio', 'token-incorreto', now() - interval '1 hour', now(), 10
    );
    raise exception 'reader aceitou token incorreto';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.sol_caixa_governanca_readback_v1(
      'writer-ensaio', 'token-escritor-ensaio', now() - interval '4 days', now(), 10
    );
    raise exception 'reader aceitou janela larga';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.sol_caixa_governanca_readback_v1(
      'writer-ensaio', 'token-escritor-ensaio', now() - interval '1 hour', now() + interval '1 minute', 1
    );
    raise exception 'reader truncou silenciosamente';
  exception when program_limit_exceeded then null;
  end;

  if not has_function_privilege(
       'anon',
       'public.sol_caixa_governanca_readback_v1(text,text,timestamp with time zone,timestamp with time zone,integer)',
       'execute'
     )
     or has_table_privilege('anon', 'public.sol_caixa_governanca_episodios_v1', 'select')
     or has_table_privilege('anon', 'public.sol_caixa_governanca_eventos_v1', 'select') then
    raise exception 'fronteira de leitura estreita está incorreta';
  end if;
end $$;

select 'governanca shadow SQL: contrato, dedupe, sanitização e readback estreito OK' as resultado;
