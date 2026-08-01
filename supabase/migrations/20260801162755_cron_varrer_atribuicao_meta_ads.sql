-- Cron da varredura de atribuicao Meta Ads (Click-to-WhatsApp).
--
-- A edge varrer-atribuicao-meta-ads le as conversas do Chatwoot criadas nos ultimos 3 dias e
-- grava leads.meta_ad_source_id / meta_ctwa_clid onde estiverem vazios. Existe porque a rota em
-- tempo real (webhook Chatwoot -> n8n -> registrar-atribuicao-meta-ads) depende de a MENSAGEM
-- trazer external_ad_reply, e isso falha quando o lead apaga a mensagem do anuncio ou escreve a
-- mao. Medido em 01/08/2026: das 48 conversas de anuncio dos ultimos 3 dias, o fluxo em tempo
-- real tinha pego 35 (73%); a varredura fechou as outras 11 (+23%).
--
-- Roda as 04:40 BRT (07:40 UTC), 30 min ANTES do enriquecer-meta-ads-diario (05:10 BRT), para
-- que os source_id gravados aqui ja entrem no enriquecimento de nome de anuncio do mesmo dia.
--
-- Autenticacao: manda apenas x-sync-token. Funciona porque a edge esta com verify_jwt = false
-- em supabase/config.toml E valida o token dentro do proprio codigo. Se alguem remover aquela
-- linha do config.toml, este cron passa a tomar 401 no gateway e o pg_cron VAI CONTINUAR
-- marcando "succeeded" (ele so avalia se o net.http_post foi enfileirado) -- foi assim que a
-- sync-inadimplencia-emusys ficou 13 dias quebrada sem ninguem notar. Para conferir de verdade
-- que esta rodando, olhar leads_automacao_log where evento='meta_ads' and
-- detalhes->>'origem'='varredura', nao o status do cron.

select cron.unschedule('varrer-atribuicao-meta-ads-diario')
where exists (select 1 from cron.job where jobname = 'varrer-atribuicao-meta-ads-diario');

select cron.schedule(
  'varrer-atribuicao-meta-ads-diario',
  '40 7 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/varrer-atribuicao-meta-ads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
      )
    ),
    body := '{"dias": 3}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
