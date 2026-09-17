-- Atribuicao do Google Ads: coluna da campanha, par do gclid.
--
-- Contexto: a onpromedia (plataforma "CQC") opera o redirect entre o anuncio e o WhatsApp
-- e passou a mandar, por webhook, a atribuicao ja resolvida de cada conversa nova. Quando
-- o clique veio do Google, o payload traz gclid + a URL de origem, e o gad_campaignid
-- mora na query string dessa URL. Esta coluna guarda esse id -- espelha meta_ad_source_id
-- do lado Meta e da o grau "campanha" da atribuicao (o gclid da o grau "clique").
--
-- Quem escreve: edge function registrar-atribuicao-google-ads, first-touch (so quando
-- gclid esta vazio). A coluna gclid ja existia; aqui ela so ganha comentario.

alter table public.leads
  add column if not exists google_ads_campanha_id text;

comment on column public.leads.google_ads_campanha_id is
  'ID da campanha do Google Ads (gad_campaignid), extraido da URL de origem no webhook da onpromedia. Espelha meta_ad_source_id do lado Meta. Preenchido por registrar-atribuicao-google-ads, first-touch junto com gclid.';

comment on column public.leads.gclid is
  'ID do clique individual do Google Ads. Preenchido por registrar-atribuicao-google-ads a partir do webhook da onpromedia (CQC), com match por telefone e trava first-touch (so grava quando vazio).';
