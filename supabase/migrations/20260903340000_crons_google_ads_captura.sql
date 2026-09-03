-- Duas cadencias, no molde do Meta (jobids 194/195), com 10 min de defasagem
-- para nao disputarem a mesma janela de rede.
--
-- ⚠️ HORARIO com janela de 3 dias = o "real time" que o Luciano pediu.
-- ⚠️ DIARIO com janela de 45 dias = a revisao tardia. O Google atribui conversao
--    com atraso (janela de atribuicao), entao o numero de ontem muda depois.
-- ⚠️ Reescrever e o comportamento CORRETO (upsert por dia+campanha), nao efeito
--    colateral.
-- 🔴 Prova de vida pelo DADO, nunca pelo pg_cron — ele marca `succeeded` so por
--    ter enfileirado o net.http_post:
--    select max(capturado_em), max(dia), count(*) from google_ads_metricas_diarias;
select cron.unschedule('google-ads-captura-horaria')
 where exists (select 1 from cron.job where jobname = 'google-ads-captura-horaria');
select cron.unschedule('google-ads-captura-recalculo-diario')
 where exists (select 1 from cron.job where jobname = 'google-ads-captura-recalculo-diario');

select cron.schedule('google-ads-captura-horaria', '35 * * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/capturar-google-ads-diario?dias=3',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-radar-token', (select token from public.integracao_tokens where nome = 'google_ads_captura')
    ),
    body := '{}'::jsonb
  );
$cron$);

select cron.schedule('google-ads-captura-recalculo-diario', '30 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/capturar-google-ads-diario?dias=45',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-radar-token', (select token from public.integracao_tokens where nome = 'google_ads_captura')
    ),
    body := '{}'::jsonb
  );
$cron$);
