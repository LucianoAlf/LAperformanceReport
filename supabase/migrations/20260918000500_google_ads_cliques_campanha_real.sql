-- O gad_campaignid da URL NAO e o campaign.id da API -- provado em 17/09/2026.
--
-- O clique real do lead 14201 carimbou gad_campaignid=23155373713 na URL. Esse id nao existe
-- em NENHUMA conta: nem na 7179097170 que lemos, nem nas 38 do MCC que gerencia a escola
-- (consultado ao vivo), nem como asset_group/ad_group/campaign_budget. Perguntando ao Google
-- pelo PROPRIO gclid (recurso click_view), a resposta foi campaign.id 23150914508 --
-- "[CG] [P.MAX] [LEADS] 18.10.2025", que ESTA na conta que lemos e cuja URL final e
-- exatamente a landing do clique.
--
-- Logo: sao dois identificadores diferentes. O da URL nao cruza com
-- google_ads_metricas_diarias e nao serve para nomear campanha nem para dividir custo.
--
-- Esta migration separa os dois: `gad_campaignid` guarda o que chegou (registro do que o
-- Google carimbou) e `campanha_id` passa a guardar o id REAL, resolvido pelo click_view.

alter table public.google_ads_cliques
  add column if not exists gad_campaignid        text,
  add column if not exists campanha_nome         text,
  add column if not exists campanha_resolvida_em timestamptz;

-- O que ja esta gravado em campanha_id e o da URL: move para o lugar certo e zera.
update public.google_ads_cliques
   set gad_campaignid = campanha_id, campanha_id = null
 where campanha_id is not null and gad_campaignid is null;

comment on column public.google_ads_cliques.gad_campaignid is
  'O gad_campaignid que o Google carimbou na URL de destino. NAO e o campaign.id da API e nao cruza com google_ads_metricas_diarias -- guardado so como registro do que chegou. Ver campanha_id.';

comment on column public.google_ads_cliques.campanha_id is
  'ID REAL da campanha (campaign.id da API), resolvido perguntando ao Google pelo gclid via click_view. E este que cruza com google_ads_metricas_diarias e serve para custo por campanha.';

comment on column public.google_ads_cliques.campanha_resolvida_em is
  'Quando o click_view respondeu. Nulo = ainda nao resolvido (o resolvedor re-tenta). click_view so cobre os ultimos 90 dias, entao clique antigo nunca resolvido fica nulo para sempre.';

-- Fila do resolvedor: clique com gclid e sem campanha real ainda.
create index if not exists idx_google_ads_cliques_sem_campanha
  on public.google_ads_cliques (conversa_criada_em)
  where campanha_id is null;
