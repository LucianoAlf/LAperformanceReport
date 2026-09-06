-- O ID DA CONVERSA DE UM LEAD, COM GATE DE UNIDADE (06/09/2026).
--
-- A tool `resolver_conversa` precisa saber QUAL conversa fechar. Duas coisas
-- que ela nao pode fazer:
--
--   · receber o `conversation_id` como argumento — seria o MODELO escolhendo
--     qual conversa fechar, e errar ali fecha a conversa de outra pessoa;
--   · ler `leads` direto — o escopo por unidade some, e a consultora da Barra
--     poderia fechar conversa do Recreio.
--
-- Entao o id vem daqui, resolvido pelo telefone de quem pede, no servidor —
-- mesmo padrao de `mila_base_comercial_v1`.
--
-- ⚠️ Devolve tambem o estado, para a Mila poder dizer "essa ja esta resolvida"
--    em vez de fechar de novo e responder "pronto" sobre um no-op.

create or replace function public.mila_conversa_do_lead_v1(
  p_solicitante_telefone text, p_lead_id bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_quem record; v_lead record;
begin
  select * into v_quem
  from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));
  if v_quem.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido');
  end if;

  select l.id, l.nome, l.unidade_id, l.chatwoot_conversation_id, l.chatwoot_status,
         l.chatwoot_espelhado_em, l.motivo_nao_matricula
    into v_lead
  from leads l where l.id = p_lead_id;

  if v_lead.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado');
  end if;

  -- ⚠️ Diretoria enxerga tudo; consultora so a unidade dela. Sem este ramo, a
  --    consultora da Barra fecharia conversa do Recreio.
  if lower(coalesce(v_quem.nivel,'')) <> 'diretoria'
     and v_quem.unidade_id is not null
     and v_lead.unidade_id is distinct from v_quem.unidade_id then
    return jsonb_build_object('ok', false, 'motivo', 'fora_do_escopo',
      'recado', 'Esse lead não é da sua unidade — eu não mexo nos outros.');
  end if;

  if v_lead.chatwoot_conversation_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_conversa_espelhada',
      'recado', 'Não encontrei a conversa desse lead no espelho do Chatwoot.');
  end if;

  return jsonb_build_object('ok', true,
    'lead_id', v_lead.id, 'nome', v_lead.nome,
    'conversation_id', v_lead.chatwoot_conversation_id,
    'status_atual', v_lead.chatwoot_status,
    'espelhado_em', v_lead.chatwoot_espelhado_em,
    'ja_resolvida', (v_lead.chatwoot_status = 'resolved'),
    'motivo_registrado', v_lead.motivo_nao_matricula);
end; $function$;

revoke all on function public.mila_conversa_do_lead_v1(text, bigint) from public, anon;
grant execute on function public.mila_conversa_do_lead_v1(text, bigint) to service_role;

-- prova: acha a conversa do caso da Daiana e barra quem e de outra unidade
do $prova$
declare v jsonb; v_tel_rec text; v_tel_outra text;
begin
  select telefone into v_tel_rec from governanca.agente_usuarios
   where lower(departamento)='comercial' and lower(coalesce(nivel,''))<>'diretoria'
     and unidade_id = (select unidade_id from leads where id = 13771) limit 1;
  select telefone into v_tel_outra from governanca.agente_usuarios
   where lower(departamento)='comercial' and lower(coalesce(nivel,''))<>'diretoria'
     and unidade_id is not null
     and unidade_id <> (select unidade_id from leads where id = 13771) limit 1;

  if v_tel_rec is not null then
    v := mila_conversa_do_lead_v1(v_tel_rec, 13771);
    if not (v->>'ok')::bool or (v->>'conversation_id')::bigint <> 20303 then
      raise exception 'nao achou a conversa do Adam para quem e da unidade: %', v;
    end if;
    if not (v->>'ja_resolvida')::bool then
      raise exception 'esperava ja_resolvida=true (a conversa 20303 esta resolved)';
    end if;
  end if;

  if v_tel_outra is not null then
    v := mila_conversa_do_lead_v1(v_tel_outra, 13771);
    if (v->>'ok')::bool then
      raise exception 'consultora de outra unidade conseguiu a conversa — gate furado: %', v;
    end if;
  end if;

  raise notice 'gate provado: mesma unidade acha a conversa 20303 e ja sabe que esta resolvida; outra unidade e barrada';
end $prova$;
