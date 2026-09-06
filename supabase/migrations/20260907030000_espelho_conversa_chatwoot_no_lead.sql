-- O ESTADO DA CONVERSA NO CHATWOOT VIRA DADO DO LEAD (06/09/2026).
--
-- Achado da Daiana (Recreio), em audio: o relatorio diario manda "Ligar HOJE,
-- nao mandar mensagem" sobre leads que ela **ja fechou**. Ela descreveu o
-- protocolo dela:
--
--   "Quando tem alguma coisa ainda pra resolver, que da pra tentar resgatar, eu
--    NAO resolvo a conversa — deixo ali ate pra eu nao esquecer daquele
--    cliente. Quando eu ENCERRO e porque ja acabou o assunto, nao tem mais o
--    que resgatar."
--
-- Ou seja: o `aberta/resolvida` dela **e** declaracao de desfecho. A regra R15
-- pergunta `motivo_nao_matricula is null` — olha o CRM e nunca o Chatwoot.
--
-- Verificado caso a caso: a conversa 20303 (Adam Braga Boarim) esta
-- `status: resolved`, com a ultima mensagem escrita pela propria Daiana em
-- 03/09 — "Ta ok, sem problemas. Muito obrigada pelo retorno e fico no aguardo
-- de voces futuramente". O desfecho existe, esta escrito, e o sinal nao alcanca.
--
-- 🔴 RUIDO COM PESSOA CORRETA E O PIOR TIPO. Quem trabalha certo — fecha o que
--    acabou e deixa aberto so o que da para resgatar — e exatamente quem mais
--    recebe o alarme falso. Isso ensina o time a ignorar o canal, e o sinal
--    verdadeiro morre junto.
--
-- ⚠️ `leads.chatwoot_conversation_id` JA EXISTIA e estava **0 de 9.857
--    preenchido**. Coluna criada e nunca usada — o elo nunca foi construido.
--
-- ⚠️ Colunas em `leads`, sem tabela nova: a pergunta e sempre "qual o estado da
--    conversa DESTE lead", e a chave e o lead.
--
-- ⚠️ NAO grava conteudo de mensagem, so metadado (status, quando, de quem veio
--    a ultima). Espelho de conversa nao e arquivo de conversa.

alter table public.leads
  add column if not exists chatwoot_status              text,
  add column if not exists chatwoot_status_em           timestamptz,
  add column if not exists chatwoot_ultima_msg_em       timestamptz,
  add column if not exists chatwoot_ultima_msg_de       text,
  add column if not exists chatwoot_espelhado_em        timestamptz;

comment on column public.leads.chatwoot_status is
  'Espelho de `status` da conversa no Chatwoot: open | pending | resolved | snoozed. '
  'RESOLVED e DECLARACAO DE DESFECHO da consultora — ela so resolve o que acabou. '
  'NULL = sem espelho; nunca ler NULL como resolvida.';
comment on column public.leads.chatwoot_ultima_msg_de is
  'Quem escreveu por ultimo: `cliente` | `equipe`. Conversa ABERTA com a ultima '
  'mensagem da EQUIPE e cliente em silencio = candidata a fechar (regra R20).';
comment on column public.leads.chatwoot_espelhado_em is
  'Quando a varredura tocou esta linha. Espelho velho e tao perigoso quanto '
  'espelho ausente — as regras exigem frescor.';

create index if not exists idx_leads_chatwoot_conversa
  on public.leads (chatwoot_conversation_id) where chatwoot_conversation_id is not null;
create index if not exists idx_leads_chatwoot_status
  on public.leads (chatwoot_status, chatwoot_espelhado_em) where chatwoot_status is not null;

-- ── a escrita do espelho, em lote ──────────────────────────────────────────
-- ⚠️ Uma chamada por lote, nao por lead: a varredura le ~200 conversas por
--    rodada e 200 requests ao PostgREST seria desperdicio e ruido no log.
create or replace function public.registrar_espelho_chatwoot_v1(p_itens jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_tocados int := 0; v_sem_lead int := 0; v_item jsonb; v_id bigint;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('ok', false, 'motivo', 'itens_invalidos');
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    -- ⚠️ Casa por TELEFONE SO DIGITOS: o Chatwoot guarda "+55219...", o lead
    --    guarda "55219..." e as vezes com mascara. Comparar cru erra tudo.
    select l.id into v_id
    from leads l
    where regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g')
          = regexp_replace(coalesce(v_item->>'telefone', ''), '\D', '', 'g')
      and regexp_replace(coalesce(v_item->>'telefone', ''), '\D', '', 'g') <> ''
      and (v_item->>'unidade_id' is null or l.unidade_id = (v_item->>'unidade_id')::uuid)
    order by l.created_at desc
    limit 1;

    if v_id is null then
      v_sem_lead := v_sem_lead + 1;
      continue;
    end if;

    update leads set
      chatwoot_conversation_id = (v_item->>'conversation_id')::bigint,
      chatwoot_status          = v_item->>'status',
      chatwoot_status_em       = coalesce((v_item->>'status_em')::timestamptz, now()),
      chatwoot_ultima_msg_em   = (v_item->>'ultima_msg_em')::timestamptz,
      chatwoot_ultima_msg_de   = v_item->>'ultima_msg_de',
      chatwoot_espelhado_em    = now()
    where id = v_id;
    v_tocados := v_tocados + 1;
  end loop;

  return jsonb_build_object('ok', true, 'tocados', v_tocados, 'sem_lead', v_sem_lead);
end; $function$;

revoke all on function public.registrar_espelho_chatwoot_v1(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_espelho_chatwoot_v1(jsonb) to service_role;

-- prova: o espelho grava e casa por telefone com mascara diferente
do $prova$
declare v jsonb; v_lead record;
begin
  select id, telefone, unidade_id into v_lead from leads
   where nome = 'Adam Braga Boarim' limit 1;
  if v_lead.id is null then
    raise notice 'lead de prova nao existe mais — pulo a prova de escrita';
    return;
  end if;

  -- telefone com mascara diferente da guardada, de proposito
  v := registrar_espelho_chatwoot_v1(jsonb_build_array(jsonb_build_object(
        'telefone', '+55 (21) 97629-1246', 'conversation_id', 20303,
        'status', 'resolved', 'status_em', '2026-09-03T18:30:44Z',
        'ultima_msg_em', '2026-09-03T09:36:46Z', 'ultima_msg_de', 'equipe')));
  if (v->>'tocados')::int <> 1 then
    raise exception 'esperava tocar 1 lead, toquei % (sem_lead=%)',
      v->>'tocados', v->>'sem_lead';
  end if;

  select chatwoot_status, chatwoot_conversation_id, chatwoot_ultima_msg_de
    into v_lead from leads where id = v_lead.id;
  if v_lead.chatwoot_status <> 'resolved' or v_lead.chatwoot_conversation_id <> 20303 then
    raise exception 'espelho nao gravou: %', v_lead;
  end if;

  raise notice 'espelho provado: conversa % marcada como % (ultima msg da %)',
    v_lead.chatwoot_conversation_id, v_lead.chatwoot_status, v_lead.chatwoot_ultima_msg_de;
end $prova$;
