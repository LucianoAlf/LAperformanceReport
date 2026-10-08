-- Rastreador proprio de cliques para WhatsApp (substitui a onpromedia/CQC).
--
-- Cada clique num botao/link de WhatsApp passa pela edge `ir-whatsapp`, que grava uma linha
-- aqui e devolve o redirect com um codigo INVISIVEL (caracteres de largura zero) no fim do
-- texto pre-preenchido. Quando a mensagem chega no Chatwoot, `rastreador-casar` acha o codigo
-- e amarra clique -> telefone -> lead. O lead nao ve nada e pode editar o texto visivel.
--
-- Nao toca em `leads` nesta fase: so registra a ligacao. Aplicar canal/origem no lead e um
-- passo separado, depois de conferir o casamento com dado real.

create table if not exists public.rastreio_cliques (
  id                       bigint generated always as identity primary key,
  codigo                   text        not null,
  origem                   text        not null default 'outro',   -- bio | site | lp | outro
  unidade                  text        not null,                    -- barra | cg | recreio
  publico                  text        not null default 'school',   -- school | kids
  destino_telefone         text        not null,
  texto_visivel            text        not null,
  gclid                    text,
  gbraid                   text,
  wbraid                   text,
  fbclid                   text,
  fbp                      text,
  fbc                      text,
  utm_source               text,
  utm_medium               text,
  utm_campaign             text,
  utm_content              text,
  utm_term                 text,
  page_url_origem          text,
  referer                  text,
  user_agent               text,
  situacao                 text        not null default 'aguardando', -- aguardando | casado | sem_conversa
  telefone_lead            text,
  chatwoot_conversation_id bigint,
  lead_id                  integer,
  delay_segundos           integer,
  casado_em                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint rastreio_cliques_situacao_chk check (situacao in ('aguardando', 'casado', 'sem_conversa'))
);

-- O codigo so precisa ser unico enquanto a linha esta viva; a busca do casamento filtra por
-- recencia, entao a colisao de dois codigos iguais em meses diferentes nao casa errado.
create index if not exists rastreio_cliques_codigo_idx   on public.rastreio_cliques (codigo, created_at desc);
create index if not exists rastreio_cliques_situacao_idx on public.rastreio_cliques (situacao, created_at);
create index if not exists rastreio_cliques_lead_idx     on public.rastreio_cliques (lead_id) where lead_id is not null;
create index if not exists rastreio_cliques_telefone_idx on public.rastreio_cliques (telefone_lead) where telefone_lead is not null;

alter table public.rastreio_cliques enable row level security;
-- Sem policy de proposito: so a service_role (edges) enxerga. O ALTER DEFAULT PRIVILEGES do
-- schema public concede tudo a anon/authenticated, entao o revoke precisa ser explicito.
revoke all on public.rastreio_cliques from anon, authenticated;

comment on table public.rastreio_cliques is
  'Cliques em links de WhatsApp rastreados pela edge ir-whatsapp. Casados pela edge rastreador-casar via codigo invisivel na mensagem.';
