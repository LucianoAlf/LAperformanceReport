-- Resolve a campanha REAL de cada clique, perguntando ao Google pelo gclid (click_view).
--
-- POR QUE EXISTE: o `gad_campaignid` que o Google carimba na URL NAO e o `campaign.id` da
-- API -- medido em 17/09/2026. O clique do lead 14201 trouxe 23155373713, que nao existe em
-- conta nenhuma; pelo gclid, o Google respondeu 23150914508 ("[CG] [P.MAX] [LEADS]
-- 18.10.2025"). So o segundo cruza com google_ads_metricas_diarias.
--
-- POR QUE 4x POR DIA, e nao a cada 10 min como a varredura: o `click_view` tem LATENCIA --
-- o clique demora horas para aparecer la. Consultar de minuto em minuto so gastaria chamada
-- para ouvir "ainda nao". Medido no mesmo dia: o clique das 18h34 resolveu na hora; o das
-- 23h58 ainda nao tinha aparecido.
--
-- ⚠️ pg_cron marca "succeeded" quando apenas ENFILEIRA o net.http_post. Conferir pelo efeito:
--   select count(*) filter (where campanha_id is null) as sem_campanha,
--          count(*) filter (where campanha_id is not null) as resolvidos
--     from public.google_ads_cliques;

select cron.schedule(
  'resolver-campanha-google-ads',
  '25 */6 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/registrar-atribuicao-google-ads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
    ),
    body := jsonb_build_object('resolver_campanhas', true),
    timeout_milliseconds := 120000
  );
  $$
);
