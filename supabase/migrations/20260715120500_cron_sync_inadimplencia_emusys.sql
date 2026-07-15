-- Cron de sync-inadimplencia-emusys: 3 horarios/dia (08h, 13h, 18h BRT = 11h, 16h, 21h UTC),
-- 1 unidade por invocacao defasada 20min (mesmo espacamento de sync-matriculas-emusys), pra
-- nao estourar o timeout de 150s nem o rate limit de 60 req/min da API do Emusys.
SELECT cron.schedule('sync-inadimplencia-cg-manha', '0 11 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-recreio-manha', '20 11 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-barra-manha', '40 11 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-cg-tarde', '0 16 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-recreio-tarde', '20 16 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-barra-tarde', '40 16 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-cg-noite', '0 21 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-recreio-noite', '20 21 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);

SELECT cron.schedule('sync-inadimplencia-barra-noite', '40 21 * * *', $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-inadimplencia-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token')
    ),
    timeout_milliseconds := 150000
  );
$$);
