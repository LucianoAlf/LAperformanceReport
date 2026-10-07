-- Espelho do Chatwoot no lead: grava so o que muda, num comando so (CP6).
--
-- MEDIDO (06/10/2026): `registrar_espelho_chatwoot_v1` (chamada pelo script da Mila na la-hq,
-- `varrer-conversas-chatwoot.py`, ~a cada 40 min, lotes de 200) regravava TODO lead do lote a
-- cada rodada so para carimbar `chatwoot_espelhado_em = now()`: 15.799 updates em 2 dias contra
-- ~600 mudancas reais de status. Cada update = linha de audit_log (trg_audit), WAL e, por ser um
-- UPDATE por item, uma invalidacao dos caches do Comercial (gatilho de cache e por COMANDO) --
-- `leads` aparecia com ~500 invalidacoes/hora. E o casamento por telefone rodava regexp em todos
-- os ~11 mil leads para CADA item: ~1,9 s por chamada (pg_stat_statements).
--
-- QUEM LE OS CAMPOS: `fn_lead_estado_pauta_v1` usa `chatwoot_espelhado_em` com corte de 2 DIAS
-- ("espelho velho = nao sei, cobrar"); `mila_conversa_do_lead_v1` so devolve o valor;
-- `vw_jornada_lead_v1`/`meta_conversoes_fila` so repassam a coluna (a edge da Meta nao a le).
-- `chatwoot_status_em` nao decide nada em lugar nenhum. Por isso o espelho de lead sem mudanca
-- e renovado a cada 6 h -- bem dentro dos 2 dias. Efeito colateral declarado: se o script parar,
-- a pauta passa a "cobrar" ate 6 h mais tarde do que antes.
--
-- PROVA (transacao desfeita no fim, 200 leads reais com conversa, 30 status trocados, 5 itens
-- repetidos, 10 telefones sem lead): estado final IDENTICO ao da funcao antiga em conversa,
-- status, ultima mensagem e autor (0 diferencas), mesmas contagens `tocados`/`sem_lead`;
-- 1.163 -> 247 ms; 1a chamada grava 145, 2a chamada grava 0 (a antiga regravaria os 200).
-- Casamento lead<->conversa conferido a parte em 276 telefones (+digitos, cru, com mascara,
-- com e sem unidade): 0 divergencias.
--
-- Tambem: search_path passa a 'public, pg_temp' (antes so 'public', o que deixava pg_temp
-- implicitamente na FRENTE numa funcao SECURITY DEFINER).
--
-- Custo/dia: REDUZ (~1,7 s a menos por chamada x ~36 chamadas/dia; ~90% menos updates em leads).

create or replace function public.registrar_espelho_chatwoot_v1(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
-- 06/10/2026 (CP6): mesma regra de casamento e mesmo SET, com tres mudancas de custo:
--   1) digitos do telefone calculados UMA vez por chamada (antes: regexp em todos os ~11 mil
--      leads para CADA item -- ~1,9 s por chamada);
--   2) so grava o lead quando algum campo espelhado muda, ou quando o espelho tem mais de
--      6 h (a pauta trata como "nao sei" a partir de 2 dias: fn_lead_estado_pauta_v1);
--      antes regravava todo lead a cada rodada (~40 min): 15.799 updates em 2 dias, cada um
--      com linha de audit_log e invalidacao dos caches do Comercial;
--   3) UM comando de UPDATE por chamada (antes: um por item), e nenhum se nada mudou --
--      o gatilho de cache e por COMANDO, nao por linha.
-- Itens repetidos para o mesmo lead: vale o ULTIMO do array, como no laco antigo.
-- `tocados` mantem o sentido de antes (itens casados com lead); `gravados` e novo.
declare
  v_tocados int := 0;
  v_sem_lead int := 0;
  v_gravados int := 0;
  v_gravar jsonb;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('ok', false, 'motivo', 'itens_invalidos');
  end if;

  with itens as (
    select x, ord,
           regexp_replace(coalesce(x->>'telefone', ''), '\D', '', 'g') as dig
    from jsonb_array_elements(p_itens) with ordinality as t(x, ord)
  ),
  -- ⚠️ Casa por TELEFONE SO DIGITOS: o Chatwoot guarda "+55219...", o lead guarda
  --    "55219..." e as vezes com mascara. Comparar cru erra tudo.
  candidatos as materialized (
    select l.id, l.unidade_id, l.created_at,
           regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') as dig
    from leads l
    where regexp_replace(coalesce(l.telefone, ''), '\D', '', 'g') in (select i.dig from itens i where i.dig <> '')
  ),
  casados as (
    select i.ord, i.x,
      (select c.id
         from candidatos c
        where c.dig = i.dig
          and i.dig <> ''
          and (i.x->>'unidade_id' is null or c.unidade_id = (i.x->>'unidade_id')::uuid)
        order by c.created_at desc
        limit 1) as lead_id
    from itens i
  ),
  ultimo as (
    select distinct on (c.lead_id) c.lead_id, c.x
    from casados c
    where c.lead_id is not null
    order by c.lead_id, c.ord desc
  ),
  gravar as (
    select u.lead_id, u.x
    from ultimo u
    join leads l on l.id = u.lead_id
    where l.chatwoot_conversation_id is distinct from (u.x->>'conversation_id')::bigint
       or l.chatwoot_status is distinct from u.x->>'status'
       or l.chatwoot_ultima_msg_em is distinct from (u.x->>'ultima_msg_em')::timestamptz
       or l.chatwoot_ultima_msg_de is distinct from u.x->>'ultima_msg_de'
       or (u.x->>'status_em' is not null
           and l.chatwoot_status_em is distinct from (u.x->>'status_em')::timestamptz)
       or l.chatwoot_espelhado_em is null
       or l.chatwoot_espelhado_em < now() - interval '6 hours'
  )
  select
    (select count(*) from casados where lead_id is not null),
    (select count(*) from casados where lead_id is null),
    (select coalesce(jsonb_agg(jsonb_build_object('lead_id', g.lead_id, 'x', g.x)), '[]'::jsonb) from gravar g)
  into v_tocados, v_sem_lead, v_gravar;

  if jsonb_array_length(v_gravar) > 0 then
    update leads l set
      chatwoot_conversation_id = (g.x->>'conversation_id')::bigint,
      chatwoot_status          = g.x->>'status',
      chatwoot_status_em       = coalesce((g.x->>'status_em')::timestamptz, now()),
      chatwoot_ultima_msg_em   = (g.x->>'ultima_msg_em')::timestamptz,
      chatwoot_ultima_msg_de   = g.x->>'ultima_msg_de',
      chatwoot_espelhado_em    = now()
    from jsonb_to_recordset(v_gravar) as g(lead_id bigint, x jsonb)
    where l.id = g.lead_id;
    get diagnostics v_gravados = row_count;
  end if;

  return jsonb_build_object('ok', true, 'tocados', v_tocados, 'sem_lead', v_sem_lead, 'gravados', v_gravados);
end;
$function$;
