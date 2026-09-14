-- Rotina diária do espelho financeiro Emusys (beta).
-- Janela revisada a cada rodada: mês corrente + 2 anteriores (a origem não tem
-- updated_em). A edge decide a janela sozinha; orçamento de tempo faz varredura
-- incremental — dias que sobram ficam pendentes e o job de retry continua.
-- Horários em UTC (pg_cron roda UTC).

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname like 'sync-financeiro-emusys-%'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('sync-financeiro-emusys-cg-principal', '5 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-financeiro-emusys-recreio-principal', '15 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-financeiro-emusys-barra-principal', '25 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
-- retries ~45 min depois: cobrem teto de 500 da API e varreduras que estouraram o orçamento
select cron.schedule('sync-financeiro-emusys-cg-retry', '50 9 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-financeiro-emusys-recreio-retry', '0 10 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
select cron.schedule('sync-financeiro-emusys-barra-retry', '10 10 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$cron$);
