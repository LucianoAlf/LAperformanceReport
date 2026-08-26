-- supabase/migrations/20260827094000_cron_repescagem_evasao_desligado.sql
-- Cron nasce DESLIGADO. Ligar so apos o envio de validacao com um caso unico,
-- com OK explicito do Hugo.

select cron.schedule(
  'processar-fila-repescagem-evasao',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-fila-repescagem-evasao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_presenca_edge_token' limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);

-- O default de timeout do pg_net e 5s e ja causou falha silenciosa neste
-- projeto; por isso timeout_milliseconds acima e explicito.

update cron.job set active = false where jobname = 'processar-fila-repescagem-evasao';
