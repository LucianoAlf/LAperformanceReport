-- Correcao operacional da Task 9.
-- O token dedicado de presenca existe no Vault, mas ainda nao foi provisionado
-- como Edge secret. Usa temporariamente o token interno de matriculas, cujo
-- fingerprint foi confirmado entre Vault e Edge, sem expor o valor bruto.

do $block$
declare
  v_job_name constant text := 'processar-conversa-evasao-cada-minuto';
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'sync_matriculas_admin_token'
      and nullif(btrim(decrypted_secret), '') is not null
  ) then
    raise exception 'secret sync_matriculas_admin_token ausente no Vault';
  end if;

  if exists (select 1 from cron.job where jobname = v_job_name) then
    perform cron.unschedule(v_job_name);
  end if;

  perform cron.schedule(
    v_job_name,
    '* * * * *',
    $cron$
      select net.http_post(
        url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/processar-conversa-evasao',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-sync-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'sync_matriculas_admin_token'
            limit 1
          )
        ),
        body := '{"limite":25}'::jsonb,
        timeout_milliseconds := 50000
      );
    $cron$
  );
end;
$block$;
