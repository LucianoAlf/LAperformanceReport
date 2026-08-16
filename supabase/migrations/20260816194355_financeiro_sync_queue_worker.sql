-- Worker duravel da fila financeira Emusys.
--
-- O refresh manual enfileira competencias e processa no maximo um job por
-- chamada. Este worker apenas drena jobs devidos; nao chama o backlog e nao
-- dispara comunicacao ou cobranca. O backoff fica persistido na fila para
-- respeitar 429 do Emusys.

do $do$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'sync-faturas-fila-worker'
  ) then
    perform cron.unschedule('sync-faturas-fila-worker');
  end if;
end
$do$;

select cron.schedule(
  'sync-faturas-fila-worker',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'supabase_anon_key'
        limit 1
      ),
      'x-sync-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'mode', 'worker',
      'trigger_source', 'cron_financeiro_sync_worker'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);
