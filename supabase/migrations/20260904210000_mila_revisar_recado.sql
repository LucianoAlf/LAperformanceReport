-- REVISAR a proposta em vez de recomecar — o jeito da Maria.
--
-- Padrao copiado do bridge da Maria (`maria-uazapi/bridge.js`, servidor
-- alfredo): a proposta vira uma PENDENCIA GRAVADA com prazo
-- (`pending_codigo_mes_action`, com `expires_at`, `chat_id` e
-- `idempotency_key`); a pessoa responde CITANDO a mensagem dela; o bridge acha a
-- pendencia pela citacao, confere que e do mesmo grupo e so entao grava. Se a
-- citacao for de outro grupo: "a proposta citada nao pertence a este grupo. Nao
-- registrei nada."
--
-- A Mila ja tinha a pendencia (`mila_recados` com `expira_em`) e a trava de
-- dono. Faltava o MEIO DA CONVERSA: quando a consultora diz "nao fala isso,
-- troca por aquilo", a Mila criava uma proposta NOVA e a antiga ficava
-- pendurada — dava para aprovar a errada. Agora ela REVISA a mesma proposta.
--
-- Provado em sombra (Dai -> professora Leticia): propos "vai faltar", ela mandou
-- trocar por "vai chegar 15 minutos atrasada", a Mila ajustou e reapresentou. No
-- banco: 1 recado, 1 revisao, versao anterior guardada — nao dois registros.
--
-- ⚠️ Revisar RENOVA o prazo (30 min a partir da revisao): quem acabou de mexer
-- no texto esta com o assunto na mao, e vencer no meio do ajuste seria absurdo.
-- ⚠️ So revisa o que esta `proposto`. Depois de enviado nao ha o que trocar —
-- mensagem enviada nao volta; ai e um recado novo corrigindo.
alter table public.mila_recados add column if not exists versoes jsonb not null default '[]'::jsonb;

create or replace function public.mila_revisar_recado_v1(
  p_solicitante_telefone text, p_recado_id uuid, p_novo_texto text, p_motivo text default null::text
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; r record;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if coalesce(trim(p_novo_texto), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'texto_vazio');
  end if;

  select * into r from mila_recados where id = p_recado_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'recado_nao_encontrado'); end if;
  if r.solicitante_telefone <> p_solicitante_telefone or r.unidade_id is distinct from q.unidade_id then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_seu_recado');
  end if;
  if r.status <> 'proposto' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_tratado', 'status', r.status,
      'nota', case when r.status = 'enviado'
                   then 'esse ja foi enviado — nao da para trocar. Se precisar, mande um recado novo corrigindo.'
                   else 'esse recado ja saiu do estado de proposta' end);
  end if;

  update mila_recados
     set texto = trim(p_novo_texto),
         versoes = versoes || jsonb_build_object('texto', r.texto, 'trocado_em', now(),
                                                 'motivo', nullif(trim(coalesce(p_motivo,'')), '')),
         expira_em = now() + interval '30 minutes'   -- quem acabou de mexer esta com o assunto na mao
   where id = r.id;

  return jsonb_build_object('ok', true, 'recado_id', r.id, 'status', 'proposto',
    'destino', jsonb_build_object('tipo', r.destino_tipo, 'nome', r.destino_nome),
    'texto', trim(p_novo_texto), 'versao', jsonb_array_length(r.versoes) + 2,
    'expira_em_minutos', 30,
    'nota', 'MOSTRE o texto novo e espere ela aprovar de novo.');
end $function$;

-- Para a Mila se situar se perder o fio (reinicio de sessao, rajada de
-- mensagens): qual e a proposta em aberto desta consultora.
create or replace function public.mila_recado_pendente_v1(p_solicitante_telefone text)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; r record;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;

  select * into r from mila_recados
   where solicitante_telefone = p_solicitante_telefone and status = 'proposto' and now() <= expira_em
   order by criado_em desc limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'tem_pendente', false,
      'nota', 'nenhuma proposta em aberto — se ela pedir para trocar algo, pergunte de que recado ela fala');
  end if;

  return jsonb_build_object('ok', true, 'tem_pendente', true, 'recado_id', r.id,
    'destino', jsonb_build_object('tipo', r.destino_tipo, 'nome', r.destino_nome),
    'texto', r.texto, 'assunto', r.assunto,
    'proposto_ha_minutos', round(extract(epoch from (now() - r.criado_em)) / 60.0),
    'expira_em_minutos', greatest(0, round(extract(epoch from (r.expira_em - now())) / 60.0)),
    'ja_revisado_vezes', jsonb_array_length(r.versoes));
end $function$;

revoke all on function public.mila_revisar_recado_v1(text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.mila_recado_pendente_v1(text) from public, anon, authenticated;
grant execute on function public.mila_revisar_recado_v1(text,uuid,text,text) to service_role, mila_acesso_restrito;
grant execute on function public.mila_recado_pendente_v1(text) to service_role, mila_acesso_restrito;
