-- Registro de cliques do Google Ads vindos do webhook da onpromedia (CQC).
--
-- ⚠️ A TABELA JA EXISTIA, com o schema da Fase 2 ABANDONADA (a pagina-pedagio propria:
-- codigo curto no texto do WhatsApp, redirect no nosso dominio). Estava VAZIA e sem nenhum
-- consumidor -- nenhuma view, funcao ou FK a referenciava. Em 17/09/2026 descobrimos que a
-- onpromedia ja opera o redirect e manda a atribuicao por webhook, entao aquele desenho
-- morreu antes de rodar. Esta migration reaproveita a tabela: descarta as colunas do
-- pedagio e acrescenta as do fluxo por webhook.
--
-- Colunas do pedagio que SOBREVIVEM porque continuam fazendo sentido:
--   gclid, gbraid, wbraid  -- gbraid/wbraid ainda nao apareceram em nenhum payload da
--                             onpromedia (pendencia aberta: e o trafego iOS/app do P.Max),
--                             mas o lugar de guardar ja existe se comecarem a vir.
--   lead_id                -- o casamento com o lead.
--
-- POR QUE A TABELA EXISTE (tres motivos, todos medidos em 17/09/2026)
--
-- 1. CORRIDA. O webhook chega ANTES do lead existir: medido em 5 de 7 conversas do dia, o
--    lead nasceu de 1,8 a 3,9 segundos DEPOIS do evento. Sem esta tabela a atribuicao cai
--    em "nao_encontrado" e some -- a edge em tempo real e one-shot. Aqui o clique fica
--    gravado e a varredura re-tenta.
-- 2. CLIQUE ORFAO. Conversa que nunca virou lead (2 de 10 no mesmo dia) nao deixa rastro
--    nenhum hoje: e verba gasta sem nem conversa cadastrada, e ninguem consegue medir.
-- 3. HISTORICO POR LEAD. `leads.gclid` guarda UM clique so. Quem clica em tres anuncios ao
--    longo de dois meses tem dois cliques sem onde existir. Aqui cada clique e uma linha --
--    e e o que torna possivel a Fase 3 (o Google usa LAST click na importacao de conversao,
--    nao o first-touch que a coluna guarda).
--
-- RELACAO COM `leads` (nao ha duplicacao de cadastro)
-- `leads` continua fonte unica do lead. Esta tabela guarda EVENTO de clique e aponta para o
-- lead quando casa. leads.gclid/google_ads_campanha_id seguem sendo o clique que ORIGINOU o
-- lead (first-touch), que e o que as telas leem.

-- 1. Fora o que era do pedagio (tabela vazia, sem consumidor -- conferido antes de aplicar)
alter table public.google_ads_cliques drop column if exists codigo;
alter table public.google_ads_cliques drop column if exists unidade_id;
alter table public.google_ads_cliques drop column if exists pagina;
alter table public.google_ads_cliques drop column if exists clicado_em;
alter table public.google_ads_cliques drop column if exists usado_em;

-- 2. O que o fluxo por webhook precisa
alter table public.google_ads_cliques
  add column if not exists campanha_id         text,
  add column if not exists cqc_conversa_id     text,
  add column if not exists cqc_event           text,
  add column if not exists telefone            text,
  add column if not exists nome_lead           text,
  add column if not exists origem              text,
  add column if not exists page_url_origem     text,
  add column if not exists tracking_link_id    text,
  add column if not exists conversa_criada_em  timestamptz,
  add column if not exists situacao            text not null default 'pendente',
  add column if not exists canal_aplicado      boolean not null default false,
  add column if not exists motivo_canal        text,
  add column if not exists tentativas          integer not null default 0,
  add column if not exists ultima_tentativa_em timestamptz,
  add column if not exists casado_em           timestamptz,
  add column if not exists payload             jsonb,
  add column if not exists created_at          timestamptz not null default now(),
  add column if not exists updated_at          timestamptz not null default now();

-- Um clique = uma linha. A onpromedia manda DOIS eventos por conversa (conversa.criada e
-- depois conversa.evento_disparado) ecoando a MESMA atribuicao; o segundo atualiza a linha
-- em vez de criar outra.
create unique index if not exists idx_google_ads_cliques_gclid
  on public.google_ads_cliques (gclid);

-- Fila da varredura: so as pendentes interessam, e sao poucas.
create index if not exists idx_google_ads_cliques_pendentes
  on public.google_ads_cliques (created_at)
  where situacao = 'pendente';

create index if not exists idx_google_ads_cliques_lead
  on public.google_ads_cliques (lead_id)
  where lead_id is not null;

create index if not exists idx_google_ads_cliques_telefone
  on public.google_ads_cliques (telefone);

comment on table public.google_ads_cliques is
  'Cliques do Google Ads recebidos do webhook da onpromedia (CQC). Guarda EVENTO de clique, nao lead -- `leads` continua fonte unica. Serve de fila de re-tentativa (o webhook chega segundos antes do lead existir), de registro do clique orfao e do historico de cliques por lead. Schema reaproveitado da Fase 2 abandonada (pagina-pedagio propria), que nunca chegou a rodar.';

comment on column public.google_ads_cliques.situacao is
  'pendente = ainda sem lead casado (a varredura re-tenta) | casado = vinculado a um lead | ambiguo = 2+ leads dividem o telefone, decisao humana | expirado = saiu da janela da varredura sem nunca achar lead (clique orfao)';

comment on column public.google_ads_cliques.motivo_canal is
  'Por que canal_origem_id foi ou nao alterado no lead: vazio_preenchido (tapa-buraco) | sobrescrito (o lead nasceu DEPOIS da conversa, entao o clique trouxe a pessoa) | preservado_reengajamento (o lead ja existia antes da conversa -- o clique nao trouxe ninguem, so reengajou)';

comment on column public.google_ads_cliques.conversa_criada_em is
  'conversa.created_at do payload -- NUNCA a hora em que o webhook chegou. E o que decide se o clique trouxe a pessoa: o webhook chega ~1-2s depois da conversa nascer e o lead ~2-4s depois disso, entao comparar pela hora de chegada classificaria errado justamente o caso mais comum.';

comment on column public.google_ads_cliques.gbraid is
  'Equivalente do gclid para trafego iOS/app. Nunca veio preenchido nos payloads da onpromedia ate 17/09/2026 -- pendencia aberta com o Rayan, porque P.Max gera muito trafego iOS e a perda seria silenciosa.';

-- Mesma politica do resto do projeto: a tabela nunca e exposta na API.
-- Quem escreve e a edge function com service_role, que ignora RLS.
alter table public.google_ads_cliques enable row level security;
