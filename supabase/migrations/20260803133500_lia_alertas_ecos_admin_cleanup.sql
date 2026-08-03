-- Remove exclusivamente os dois ecos dos pilotos internos da Lia que entraram
-- na Caixa de Entrada. Preserva a conversa real e todas as demais mensagens.

do $cleanup$
declare
  v_conversa_id constant uuid := 'a9d1ad72-8621-429b-baf1-559e6850c0f9';
  v_provider_ids constant text[] := array[
    '3EB01E74F9436FFE432905',
    '3EB0D39B4723961827A2A2'
  ];
  v_outbox_count integer;
  v_admin_count integer;
  v_mismatch_count integer;
  v_evasao_count integer;
  v_remaining_count integer;
  v_latest_at timestamptz;
  v_latest_preview text;
begin
  select count(*)
  into v_outbox_count
  from public.lia_alertas_privados lap
  join public.lia_pesquisa_eventos lpe on lpe.id = lap.evento_id
  where lap.provider_message_id = any(v_provider_ids)
    and lap.caixa_id = 3
    and lap.destinatario_usuario_id = 2
    and lap.status = 'enviado'
    and lpe.ambiente = 'teste';

  if v_outbox_count <> 2 then
    raise exception 'cleanup_lia_abortado: outbox esperada=2 encontrada=%', v_outbox_count;
  end if;

  select count(*)
  into v_admin_count
  from public.admin_mensagens am
  join public.lia_alertas_privados lap
    on lap.provider_message_id = am.whatsapp_message_id
  where am.conversa_id = v_conversa_id
    and am.whatsapp_message_id = any(v_provider_ids)
    and am.direcao = 'saida'
    and lap.caixa_id = 3;

  if v_admin_count <> 2 then
    raise exception 'cleanup_lia_abortado: ecos admin esperados=2 encontrados=%', v_admin_count;
  end if;

  select count(*)
  into v_mismatch_count
  from public.admin_mensagens am
  join public.lia_alertas_privados lap
    on lap.provider_message_id = am.whatsapp_message_id
  where am.conversa_id = v_conversa_id
    and am.whatsapp_message_id = any(v_provider_ids)
    and am.conteudo is distinct from lap.mensagem_renderizada;

  if v_mismatch_count <> 0 then
    raise exception 'cleanup_lia_abortado: conteudo divergente em % eco(s)', v_mismatch_count;
  end if;

  select count(*)
  into v_evasao_count
  from public.pesquisa_evasao_mensagens pem
  where pem.provider_message_id = any(v_provider_ids);

  if v_evasao_count <> 0 then
    raise exception 'cleanup_lia_abortado: % evento(s) de evasao usam os IDs dos pilotos', v_evasao_count;
  end if;

  select count(*)
  into v_remaining_count
  from public.admin_mensagens am
  where am.conversa_id = v_conversa_id
    and not (am.whatsapp_message_id = any(v_provider_ids));

  if v_remaining_count < 1 then
    raise exception 'cleanup_lia_abortado: conversa ficaria sem mensagens reais';
  end if;

  delete from public.admin_mensagens am
  where am.conversa_id = v_conversa_id
    and am.whatsapp_message_id = any(v_provider_ids);

  select
    am.created_at,
    left(coalesce(nullif(am.conteudo, ''), '[' || coalesce(am.tipo, 'mensagem') || ']'), 100)
  into v_latest_at, v_latest_preview
  from public.admin_mensagens am
  where am.conversa_id = v_conversa_id
  order by am.created_at desc, am.id desc
  limit 1;

  if v_latest_at is null then
    raise exception 'cleanup_lia_abortado: nenhuma mensagem restante encontrada';
  end if;

  update public.admin_conversas
  set ultima_mensagem_at = v_latest_at,
      ultima_mensagem_preview = v_latest_preview,
      updated_at = now()
  where id = v_conversa_id;

  if not found then
    raise exception 'cleanup_lia_abortado: conversa alvo inexistente';
  end if;

  raise notice 'cleanup_lia_concluido: 2 ecos removidos; % mensagens reais preservadas', v_remaining_count;
end;
$cleanup$;
