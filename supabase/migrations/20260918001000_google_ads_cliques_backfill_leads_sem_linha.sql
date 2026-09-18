-- Backfill: lead com gclid que nao tem linha em google_ads_cliques.
--
-- A PRIMEIRA versao da edge (no ar por ~4h em 17/09/2026) gravava gclid direto em `leads`,
-- antes da tabela de cliques existir. Esses leads ficariam invisiveis para o resolvedor de
-- campanha, que le da tabela -- e a campanha deles nunca seria descoberta. Pegou o lead
-- 13871, que tinha gclid e nenhuma linha.
--
-- A linha nasce ja `casado` (o lead existe e esta vinculado) e sem `campanha_id`, que e
-- exatamente o estado que o resolvedor procura. `payload` fica nulo de proposito: o evento
-- original nao foi guardado, e inventar um seria pior que assumir a lacuna.
--
-- ⚠️ `created_at` aqui e a data do LEAD, nao a do clique -- nao ha de onde tirar a segunda.
-- Por isso o resolvedor usa janela de 7 dias quando `conversa_criada_em` e nulo: buscar o
-- click_view na data do lead erraria o dia por semanas (o 13871 e de 02/09 e o clique foi
-- em 17/09).

insert into public.google_ads_cliques
  (gclid, gad_campaignid, telefone, nome_lead, origem, lead_id, situacao,
   canal_aplicado, motivo_canal, conversa_criada_em, created_at)
select l.gclid,
       l.google_ads_campanha_id,
       l.telefone,
       l.nome,
       'google',
       l.id,
       'casado',
       (l.canal_origem_id = 3),
       'backfill_v1',
       null,
       l.created_at
  from public.leads l
  left join public.google_ads_cliques c on c.lead_id = l.id
 where l.gclid is not null
   and c.id is null
on conflict (gclid) do nothing;
