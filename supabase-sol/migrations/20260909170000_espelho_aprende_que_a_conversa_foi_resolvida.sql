-- 🔴 O ESPELHO NUNCA SOUBE QUE UMA CONVERSA FOI RESOLVIDA.
--
-- `sol_chatwoot_mensagens` só recebe `message_created` (conferido em 09/09/2026:
-- 2.640 eventos em 3 dias, nenhum outro tipo). O `conversa_status` que as duas
-- views de atendimento filtram sai de dentro do payload da ÚLTIMA MENSAGEM —
-- ou seja, congela ali. Conversa resolvida DEPOIS da última mensagem segue
-- candidata para sempre.
--
-- Custo medido: a Débora (conv 20184) foi cobrada na pauta por 14 dias com a
-- conversa encerrada; e hoje às 08:00 a Daiana recebeu na DM "entra agora" no
-- Henrique Supriano (conv 20732), também `resolved`.
--
-- RESOLVER é o gesto pelo qual a equipe declara o desfecho. É a informação mais
-- forte que existe sobre "acabou" e é dela mesma — ignorá-la é cobrar quem
-- trabalhou certo, que é exatamente o que faz a equipe abandonar o agente.
--
-- ⚠️ Esta tabela é FORWARD-ONLY: ela aprende do evento em diante. Conversa
--    resolvida antes disso precisa de backfill (feito por fora, pela API) —
--    ausência aqui NÃO significa "está aberta", significa "não sei", e é por
--    isso que a leitura usa COALESCE com o status do payload, nunca só ela.
-- ⚠️ Depende do webhook 10 do Chatwoot assinar `conversation_status_changed`
--    (ligado em 09/09/2026) e da edge `chatwoot-secretaria-webhook` v2, que
--    até então descartava tudo que não fosse `message_created` numa linha.
create table if not exists public.sol_chatwoot_conversas (
  conversa_id     bigint primary key,
  inbox_id        bigint,
  status          text not null,
  mudou_em        timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  fonte           text not null default 'webhook'
);

comment on table public.sol_chatwoot_conversas is
  'Status VIVO por conversa do Chatwoot. Existe porque o status dentro de '
  '`sol_chatwoot_mensagens.raw` congela na ultima mensagem, e conversa '
  'resolvida depois dela seguia sendo cobrada. Forward-only: ausencia = '
  '"nao sei", nunca "aberta".';
comment on column public.sol_chatwoot_conversas.fonte is
  'webhook (conversation_status_changed) ou backfill (varredura pela API).';

alter table public.sol_chatwoot_conversas enable row level security;
revoke all on public.sol_chatwoot_conversas from public, anon, authenticated;
grant select, insert, update on public.sol_chatwoot_conversas to service_role;

create index if not exists sol_chatwoot_conversas_status_idx
  on public.sol_chatwoot_conversas (status) where status = 'resolved';
