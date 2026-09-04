-- T2 (calor do lead) · 1º ANDAR · camada OPERACIONAL — projeto SOL
--
-- PARA QUE EXISTE: os campos de calor em `leads` (temperatura,
-- qtd_mensagens_mila, qtd_tentativas_sem_resposta) sao 100% mortos — foram
-- desenhados e nunca alimentados. O calor tem de sair da CONVERSA.
--
-- Esta view devolve os FATOS ESTRUTURAIS de cada conversa viva. Nao interpreta,
-- nao pontua: quem interpreta e o extrator semantico, e quem decide prioridade e
-- regra deterministica. (Arquitetura: o LLM le e redige; o numero vem de RPC.)
--
-- ⚠️ "Chegou a humano" = existe mensagem de agente cujo autor NAO e uma das 3
--    contas da Mila. Nao da para usar `autor_nome` sozinho: `WhatsApp Device`
--    (2.633 msgs, 689 conversas) NAO e pessoa nem bot — e a atribuicao "enviado
--    pelo celular", e carrega os dois. Medido em 04/09.
--
-- ⚠️ `minutos_ate_humano` pode ser NEGATIVO: quer dizer que NOS iniciamos
--    (campanha, follow-up) antes de o contato falar. Negativo nao e erro — e a
--    assinatura de conversa ativa nossa, e quem consome precisa distinguir.
--
-- ⚠️ Cobertura: o departamento `comercial` so entrou no espelho em 03/09/2026
--    (inboxes 147/148/155). Antes disso so ha `secretaria`. Regra que dependa
--    de historico comercial vai ficar vazia por algumas semanas — isso e
--    esperado, nao defeito.
create or replace view public.vw_atendimento_calor_conversa as
with base as (
  select distinct on (m.conversa_id)
         m.conversa_id, m.inbox_id, m.contato_id, m.contato_nome,
         m.data_hora  ultima_msg_em,
         m.autor_tipo ultimo_autor,
         (((m.raw->'conversation')->'meta')->'sender')->>'phone_number'   telefone,
         (((m.raw->'conversation')->'meta')->'assignee')->>'name'         assignee_nome,
         (((m.raw->'conversation')->'meta')->'assignee')->>'id'           assignee_id,
         ((m.raw->'conversation')->>'status')                             conversa_status
    from public.sol_chatwoot_mensagens m
   where m.data_hora > now() - interval '21 days'
   order by m.conversa_id, m.data_hora desc
),
fatos as (
  select b.*,
         (select min(s.data_hora) from public.sol_chatwoot_mensagens s
           where s.conversa_id = b.conversa_id and s.autor_tipo = 'contact') primeiro_contato_em,
         (select min(s.data_hora) from public.sol_chatwoot_mensagens s
           where s.conversa_id = b.conversa_id and s.autor_tipo = 'agent'
             and coalesce(s.autor_nome,'') not in ('Mila Recreio','Milla CG','Milla Barra')
         ) primeiro_humano_em,
         (select count(*) from public.sol_chatwoot_mensagens s
           where s.conversa_id = b.conversa_id and s.autor_tipo = 'contact') msgs_do_contato,
         (select count(*) from public.sol_chatwoot_mensagens s
           where s.conversa_id = b.conversa_id and s.autor_tipo = 'agent'
             and coalesce(s.autor_nome,'') in ('Mila Recreio','Milla CG','Milla Barra')
         ) msgs_do_bot
    from base b
)
select f.conversa_id, f.inbox_id, i.inbox_nome, i.unidade, i.departamento,
       f.contato_id, f.contato_nome, f.telefone,
       f.assignee_id, f.assignee_nome, f.conversa_status,
       f.ultima_msg_em, f.ultimo_autor,
       round(extract(epoch from now() - f.ultima_msg_em) / 3600)::int horas_desde_ultima,
       f.primeiro_contato_em, f.primeiro_humano_em,
       (f.primeiro_humano_em is not null)                       houve_humano,
       (f.primeiro_humano_em is null and f.msgs_do_bot > 0)     so_falou_com_bot,
       case when f.primeiro_humano_em is not null and f.primeiro_contato_em is not null
            then round(extract(epoch from f.primeiro_humano_em - f.primeiro_contato_em) / 60)::int
       end                                                      minutos_ate_humano,
       f.msgs_do_contato, f.msgs_do_bot
  from fatos f
  join public.sol_chatwoot_inboxes i using (inbox_id)
 where f.conversa_status is distinct from 'resolved';

revoke all on public.vw_atendimento_calor_conversa from public, anon, authenticated;
grant select on public.vw_atendimento_calor_conversa to service_role;

comment on view public.vw_atendimento_calor_conversa is
  'T2/1o andar/operacional. FATOS estruturais da conversa viva (chegou a humano? quanto demorou? quantas mensagens do contato?). Nao interpreta e nao pontua. ⚠️ "humano" = agente que nao e Mila; `WhatsApp Device` NAO serve de discriminador. ⚠️ minutos_ate_humano NEGATIVO = nos iniciamos a conversa. ⚠️ departamento comercial so espelha desde 03/09/2026.';
