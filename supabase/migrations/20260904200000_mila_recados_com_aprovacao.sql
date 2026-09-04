-- RECADO: a Mila fala com o cliente ou com o professor A PEDIDO da consultora.
--
-- Desenho do Luciano (04/09): "a consultora pede, a Mila monta a mensagem,
-- mostra, a consultora aprova, e ai a Mila dispara". Dois destinos:
--   · LEAD/cliente — "avisa a Jaqueline que eu retorno amanha a tarde";
--   · PROFESSOR — "avisa o professor que o Caio vai faltar".
--
-- 🔴 NADA SAI SEM APROVACAO. Mesmo padrao preview+approval da Sol V3, pelo mesmo
-- motivo: mensagem que sai em nome da escola para um cliente ou um professor e
-- irreversivel. O texto e escrito pela Mila; a decisao de mandar e sempre humana.
--
-- ⚠️ A proposta EXPIRA em 30 min. Sem isso, um "pode" solto meia hora depois
-- dispararia um recado que ja nao faz sentido (a consultora ja ligou, o aluno ja
-- remarcou). Proposta vencida obriga a Mila a remontar com o dado de agora.
--
-- ⚠️ Destino resolvido SEMPRE dentro da unidade de quem pede. Nao e bug o
-- professor de "outra" unidade aparecer: 29 dos 44 professores ativos dao aula em
-- mais de uma (o Erick Cosme atende Barra e Recreio).
--
-- ⚠️ O caminho INVERSO ja existia: `chatwoot-mila-bridge-professor.js` avisa a
-- consultora quando o professor fala algo acionavel. Aqui e so a ida.
create table if not exists public.mila_recados (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades(id),
  solicitante_telefone text not null,
  solicitante_nome text not null,
  destino_tipo text not null check (destino_tipo in ('lead','professor')),
  destino_ref text,
  destino_nome text not null,
  destino_telefone text not null,
  assunto text,
  texto text not null,
  status text not null default 'proposto'
    check (status in ('proposto','aprovado','enviado','cancelado','falhou')),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '30 minutes',
  aprovado_em timestamptz,
  enviado_em timestamptz,
  conversation_id bigint,
  message_id bigint,
  erro text
);
create index if not exists mila_recados_pendentes_idx
  on public.mila_recados (solicitante_telefone, status, criado_em desc);
alter table public.mila_recados enable row level security;
revoke all on public.mila_recados from public, anon, authenticated;
-- as 3 funcoes vao no arquivo seguinte (dump do que esta em producao)
