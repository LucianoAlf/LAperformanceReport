-- Casamento pelo ATRASO EXATO do WhatsApp (08/10/2026).
--
-- Em toda conversa aberta por link (click_to_chat_link) o WhatsApp registra, na primeira mensagem,
-- `external_ad_reply.entry_point_conversion_delay_seconds`: os segundos entre o toque no link e o
-- envio. Hora da mensagem - atraso = o instante do clique, ao segundo, mesmo que o lead espere
-- horas e mesmo que apague o texto (e o codigo invisivel junto). Casa por UNIDADE + esse instante.
--
--   codigo = achou o codigo invisivel na mensagem (certo)
--   atraso = unidade + instante exato do clique pelo atraso do WhatsApp (forte)
--   janela = sem codigo e sem atraso; unidade + proximidade de horario (provavel)

alter table public.rastreio_cliques drop constraint if exists rastreio_cliques_metodo_chk;
alter table public.rastreio_cliques add constraint rastreio_cliques_metodo_chk
  check (metodo_casamento is null or metodo_casamento in ('codigo', 'atraso', 'janela'));

comment on column public.rastreio_cliques.metodo_casamento is
  'codigo = codigo invisivel na mensagem (certo). atraso = unidade + instante exato do clique via entry_point_conversion_delay_seconds do WhatsApp (forte). janela = unidade + proximidade de horario (provavel).';
