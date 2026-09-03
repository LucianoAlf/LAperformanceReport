-- Projeto: SOL (bvltexmlmydsncfjstbr).
-- Contrato de leitura do espelho do Chatwoot para o Mapa de Sinais (A5).
--
-- Devolve UMA linha por conversa em que a ultima palavra foi do CLIENTE e
-- ninguem respondeu ainda, com o transcript das ultimas 8 mensagens. O extrator
-- semantico roda no LA REPORT (e la que estao `alunos`/`leads` para resolver o
-- telefone, e a chave da OpenAI em `assistente_ia_config`), entao so o TEXTO
-- atravessa a fronteira entre os dois projetos.
--
-- ⚠️ Nao ha filtro de cortesia aqui de proposito. Um regex de "obrigada|ok|👍"
-- cortaria 176 candidatos para ~51, mas classificar linguagem por regex e
-- justamente o que se decidiu parar de fazer neste sistema; e a economia seria
-- de centavos. Quem decide se "❤️" precisa de resposta e o modelo.
--
-- Medido em 03/09/2026: 176 candidatos, 104 kB de texto, 6,8 msgs/conversa.

create or replace view public.vw_atendimento_candidatos_sinal as
with ultima as (
  select distinct on (m.conversa_id)
    m.conversa_id,
    m.inbox_id,
    m.message_id                                              as ultimo_message_id,
    m.data_hora                                               as ultima_msg_em,
    m.autor_tipo                                              as ultimo_autor,
    m.contato_id,
    m.contato_nome,
    m.raw->'conversation'->>'status'                          as conversa_status,
    m.raw->'conversation'->'meta'->'sender'->>'phone_number'  as telefone,
    m.raw->'conversation'->'meta'->'assignee'->>'id'          as agente_id,
    m.raw->'conversation'->'meta'->'assignee'->>'name'        as agente_nome
  from public.sol_chatwoot_mensagens m
  where m.data_hora > now() - interval '21 days'
  order by m.conversa_id, m.data_hora desc
)
select
  u.conversa_id,
  u.inbox_id,
  i.inbox_nome,
  i.unidade,
  i.departamento,
  u.contato_id,
  u.contato_nome,
  u.telefone,
  u.agente_id,
  u.agente_nome,
  u.conversa_status,
  u.ultimo_message_id,
  u.ultima_msg_em,
  round(extract(epoch from now() - u.ultima_msg_em) / 3600)::int as horas_sem_resposta,
  resp.ultima_resposta_agente_em,
  t.transcript
from ultima u
join public.sol_chatwoot_inboxes i using (inbox_id)
left join lateral (
  select max(s.data_hora) as ultima_resposta_agente_em
  from public.sol_chatwoot_mensagens s
  where s.conversa_id = u.conversa_id and s.autor_tipo = 'agent'
) resp on true
cross join lateral (
  select jsonb_agg(
           jsonb_build_object(
             'quem',   x.autor_tipo,
             'quando', x.data_hora,
             'texto',  left(coalesce(x.texto, ''), 600)
           ) order by x.data_hora
         ) as transcript
  from (
    select s.autor_tipo, s.data_hora, s.texto
    from public.sol_chatwoot_mensagens s
    where s.conversa_id = u.conversa_id
    order by s.data_hora desc
    limit 8
  ) x
) t
where u.ultimo_autor = 'contact'
  and u.conversa_status is distinct from 'resolved'
  and u.ultima_msg_em between now() - interval '14 days' and now() - interval '2 hours';

comment on view public.vw_atendimento_candidatos_sinal is
  'Conversas do Chatwoot em que o cliente falou por ultimo e ninguem respondeu (2h a 14 dias). Consumida pela edge de transporte exportar-candidatos-atendimento; o veredito e do extrator semantico no LA Report. Sem filtro de cortesia de proposito.';

-- ACL: ALTER DEFAULT PRIVILEGES neste schema da `authenticated=arwdDxtm` a toda
-- relacao nova, e view simples e auto-atualizavel — sem isto, usuario autenticado
-- poderia escrever na tabela por baixo. So service_role (a edge) le esta view.
revoke all on public.vw_atendimento_candidatos_sinal from public, anon, authenticated;
