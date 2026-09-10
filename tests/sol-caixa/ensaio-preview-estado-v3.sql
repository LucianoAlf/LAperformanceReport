-- Estado persistido do preview V3: corrigido/descartado/expirado nao aprova.
-- Tudo em banco isolado e dentro de ROLLBACK.

\set ON_ERROR_STOP on
begin;

do $ensaio$
declare
  v_unidade uuid := '11111111-1111-1111-1111-111111111111';
  v_evento uuid;
  v_antigo uuid;
  v_novo uuid;
  v_concorrente uuid;
  v_rejeitado uuid;
  v_expirado uuid;
  v_appr_antigo uuid;
  v_appr_novo uuid;
  v_appr_rejeitado uuid;
  v_appr_expirado uuid;
  v_hash_antigo text := 'HASH-ANTIGO-' || gen_random_uuid()::text;
  v_hash_novo text := 'HASH-NOVO-' || gen_random_uuid()::text;
  v_hash_concorrente text := 'HASH-CONCORRENTE-' || gen_random_uuid()::text;
  v_hash_rejeitado text := 'HASH-REJEITADO-' || gen_random_uuid()::text;
  v_hash_expirado text := 'HASH-EXPIRADO-' || gen_random_uuid()::text;
  v_r jsonb;
  v_payload jsonb;
  v_falhas text[] := '{}';
begin
  insert into public.sol_caixa_autorizados
    (unidade_id, numero, nome, papel, operacoes, ativo)
  values
    (v_unidade, '5521999999998', 'Ensaio Estado Preview', 'adm', array['todas'], true)
  on conflict do nothing;

  insert into public.sol_caixa_shadow_eventos_v1
    (event_id_hash, chat_id_hash, sender_id_hash, unidade_id, source, mode, status)
  values
    ('ESTADO-'||gen_random_uuid()::text, md5('estado-preview@g.us'), 'ATOR-ESTADO',
     v_unidade, 'ensaio', 'v3_production_public_preview', 'public_preview_sent')
  returning id into v_evento;

  insert into public.sol_caixa_shadow_previews_v1
    (evento_id, preview_hash, unidade_id, operacao, categoria, valor_centavos,
     forma, status, preview_json)
  values
    (v_evento,v_hash_antigo,v_unidade,'entrada','parcela',65700,'pix',
     'public_preview_sent','{"pending":{"origem":"ORIGEM-1"}}'::jsonb),
    (v_evento,v_hash_novo,v_unidade,'entrada','parcela',65700,'pix',
     'awaiting_supersede','{"pending":{"origem":"ORIGEM-1"}}'::jsonb),
    (v_evento,v_hash_concorrente,v_unidade,'entrada','parcela',65700,'pix',
     'awaiting_supersede','{"pending":{"origem":"ORIGEM-1"}}'::jsonb),
    (v_evento,v_hash_rejeitado,v_unidade,'entrada','parcela',65700,'pix',
     'public_preview_sent','{"pending":{"origem":"ORIGEM-2"}}'::jsonb),
    (v_evento,v_hash_expirado,v_unidade,'entrada','parcela',65700,'pix',
     'public_preview_sent','{"pending":{"origem":"ORIGEM-3"}}'::jsonb);

  -- INSERT ... RETURNING com varias linhas devolve varias linhas. Resolve os
  -- ids pelos hashes para o teste nao depender da ordem fisica do RETURNING.
  select id into v_antigo from public.sol_caixa_shadow_previews_v1 where preview_hash=v_hash_antigo;
  select id into v_novo from public.sol_caixa_shadow_previews_v1 where preview_hash=v_hash_novo;
  select id into v_concorrente from public.sol_caixa_shadow_previews_v1 where preview_hash=v_hash_concorrente;
  select id into v_rejeitado from public.sol_caixa_shadow_previews_v1 where preview_hash=v_hash_rejeitado;
  select id into v_expirado from public.sol_caixa_shadow_previews_v1 where preview_hash=v_hash_expirado;

  update public.sol_caixa_shadow_previews_v1
     set criado_em = now() - interval '31 minutes'
   where id = v_expirado;

  insert into public.sol_caixa_shadow_approvals_v1
    (preview_id,approval_event_hash,actor_id_hash,decision)
  values
    (v_antigo,'AP-ANTIGO-'||gen_random_uuid()::text,'ATOR-ESTADO','approved'),
    (v_novo,'AP-NOVO-'||gen_random_uuid()::text,'ATOR-ESTADO','approved'),
    (v_rejeitado,'AP-REJ-'||gen_random_uuid()::text,'ATOR-ESTADO','approved'),
    (v_expirado,'AP-EXP-'||gen_random_uuid()::text,'ATOR-ESTADO','approved');
  select id into v_appr_antigo from public.sol_caixa_shadow_approvals_v1 where preview_id=v_antigo;
  select id into v_appr_novo from public.sol_caixa_shadow_approvals_v1 where preview_id=v_novo;
  select id into v_appr_rejeitado from public.sol_caixa_shadow_approvals_v1 where preview_id=v_rejeitado;
  select id into v_appr_expirado from public.sol_caixa_shadow_approvals_v1 where preview_id=v_expirado;

  v_r := public.sol_caixa_v3_finalizar_preview_v1(jsonb_build_object(
    'preview_id',v_antigo,'preview_hash',v_hash_antigo,'status','superseded',
    'replacement_preview_id',v_novo,'replacement_preview_hash',v_hash_novo,
    'motivo','ensaio_correcao'));
  if not coalesce((v_r->>'ok')::boolean,false) then
    v_falhas := v_falhas || ('supersede recusado: '||coalesce(v_r->>'motivo','nulo'));
  end if;
  if (select status from public.sol_caixa_shadow_previews_v1 where id=v_antigo) <> 'superseded' then
    v_falhas := v_falhas || 'preview antigo nao ficou superseded';
  end if;
  if (select status from public.sol_caixa_shadow_previews_v1 where id=v_novo) <> 'public_preview_sent' then
    v_falhas := v_falhas || 'preview novo deixou de ficar aberto';
  end if;

  -- Repetir a transicao com OUTRO substituto nao e idempotencia: e uma corrida.
  v_r := public.sol_caixa_v3_finalizar_preview_v1(jsonb_build_object(
    'preview_id',v_antigo,'preview_hash',v_hash_antigo,'status','superseded',
    'replacement_preview_id',v_concorrente,'replacement_preview_hash',v_hash_concorrente));
  if coalesce((v_r->>'ok')::boolean,false)
     or v_r->>'motivo' <> 'preview_ja_superseded_por_outro' then
    v_falhas := v_falhas || ('corrida de substituto foi aceita: '||v_r::text);
  end if;
  v_r := public.sol_caixa_v3_finalizar_preview_v1(jsonb_build_object(
    'preview_id',v_concorrente,'preview_hash',v_hash_concorrente,'status','rejected',
    'motivo','perdeu_corrida_de_supersede'));
  if not coalesce((v_r->>'ok')::boolean,false) then
    v_falhas := v_falhas || ('substituto perdedor nao foi encerrado: '||v_r::text);
  end if;

  v_payload := jsonb_build_object(
    'unidade_id',v_unidade,'valor','657','forma','pix','categoria','parcela',
    'chat_id','estado-preview@g.us','grupo_jid','estado-preview@g.us',
    'ator_numero','5521999999998','ator_papel','adm','v3_actor_id_hash','ATOR-ESTADO',
    'idempotency_key','estado-preview-'||gen_random_uuid()::text);

  v_r := public.sol_caixa_v3_validar_approval_v1(v_payload || jsonb_build_object(
    'v3_preview_id',v_antigo,'v3_preview_hash',v_hash_antigo,
    'v3_approval_id',v_appr_antigo,
    'v3_approval_event_hash',(select approval_event_hash from public.sol_caixa_shadow_approvals_v1 where id=v_appr_antigo)),
    'lancar_recebimento');
  if coalesce((v_r->>'ok')::boolean,false) or v_r->>'motivo' <> 'preview_v3_nao_aberto' then
    v_falhas := v_falhas || ('preview superseded ainda aprovou: '||v_r::text);
  end if;

  v_r := public.sol_caixa_v3_validar_approval_v1(v_payload || jsonb_build_object(
    'v3_preview_id',v_novo,'v3_preview_hash',v_hash_novo,
    'v3_approval_id',v_appr_novo,
    'v3_approval_event_hash',(select approval_event_hash from public.sol_caixa_shadow_approvals_v1 where id=v_appr_novo)),
    'lancar_recebimento');
  if not coalesce((v_r->>'ok')::boolean,false) then
    v_falhas := v_falhas || ('preview novo nao aprovou: '||coalesce(v_r->>'motivo','nulo'));
  end if;

  v_r := public.sol_caixa_v3_finalizar_preview_v1(jsonb_build_object(
    'preview_id',v_rejeitado,'preview_hash',v_hash_rejeitado,'status','rejected'));
  if not coalesce((v_r->>'ok')::boolean,false) then
    v_falhas := v_falhas || 'descarte persistido recusado';
  end if;
  v_r := public.sol_caixa_v3_validar_approval_v1(v_payload || jsonb_build_object(
    'v3_preview_id',v_rejeitado,'v3_preview_hash',v_hash_rejeitado,
    'v3_approval_id',v_appr_rejeitado,
    'v3_approval_event_hash',(select approval_event_hash from public.sol_caixa_shadow_approvals_v1 where id=v_appr_rejeitado)),
    'lancar_recebimento');
  if coalesce((v_r->>'ok')::boolean,false) or v_r->>'motivo' <> 'preview_v3_nao_aberto' then
    v_falhas := v_falhas || ('preview rejeitado ainda aprovou: '||v_r::text);
  end if;

  v_r := public.sol_caixa_v3_validar_approval_v1(v_payload || jsonb_build_object(
    'v3_preview_id',v_expirado,'v3_preview_hash',v_hash_expirado,
    'v3_approval_id',v_appr_expirado,
    'v3_approval_event_hash',(select approval_event_hash from public.sol_caixa_shadow_approvals_v1 where id=v_appr_expirado)),
    'lancar_recebimento');
  if coalesce((v_r->>'ok')::boolean,false) or v_r->>'motivo' <> 'preview_v3_expirado' then
    v_falhas := v_falhas || ('preview expirado ainda aprovou: '||v_r::text);
  end if;

  if has_function_privilege('anon','public.sol_caixa_v3_finalizar_preview_v1(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.sol_caixa_v3_finalizar_preview_v1(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.sol_caixa_v3_finalizar_preview_v1(jsonb)','EXECUTE')
     or not has_function_privilege('sol_acesso_restrito','public.sol_caixa_v3_finalizar_preview_v1(jsonb)','EXECUTE') then
    v_falhas := v_falhas || 'ACL do finalizador incorreta';
  end if;

  if array_length(v_falhas,1) > 0 then
    raise exception E'ESTADO PREVIEW FALHOU:\n  %', array_to_string(v_falhas,E'\n  ');
  end if;
  raise notice 'ESTADO PREVIEW OK — antigo bloqueado, novo aprova, descarte e expiracao bloqueiam';
end;
$ensaio$;

rollback;
