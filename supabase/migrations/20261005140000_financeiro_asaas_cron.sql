-- Rotina do espelho do extrato Asaas (Emusys beta).
-- Pedido do Super Folha (2026-10-05): diária = últimos 10 dias de cada
-- convênio; mensal = revarredura do mês anterior inteiro. Fora do horário do
-- sync dos lançamentos (~06h BRT = 09-10 UTC) para não dividir o limite da API
-- — fila serializa mesmo assim.
-- Horários em UTC (pg_cron roda UTC).

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname like 'sync-asaas-emusys-%'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

-- worker a cada minuto: drena sync_asaas_extrato_queue (cede quando outra fila
-- Emusys está rodando — claim_sync_asaas_extrato_job já confere)
select cron.schedule('sync-asaas-emusys-fila-worker', '* * * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-asaas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"worker","trigger_source":"cron_asaas_worker"}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

-- diário: últimos 10 dias encerrados, convênio a convênio (11h UTC = 08h BRT)
select cron.schedule('sync-asaas-emusys-cg-principal', '0 11 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-asaas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_daily","unidade":"cg","trigger_source":"cron_asaas_daily","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

select cron.schedule('sync-asaas-emusys-recreio-principal', '10 11 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-asaas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_daily","unidade":"recreio","trigger_source":"cron_asaas_daily","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

select cron.schedule('sync-asaas-emusys-barra-principal', '20 11 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-asaas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_daily","unidade":"barra","trigger_source":"cron_asaas_daily","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

-- mensal: dia 1, revarre o mês anterior inteiro (estorno/chargeback chegam depois)
select cron.schedule('sync-asaas-emusys-mensal', '30 12 1 * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-asaas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := '{"mode":"enqueue_monthly","unidade":"todas","trigger_source":"cron_asaas_revarredura_mensal","catalogos":true}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);
