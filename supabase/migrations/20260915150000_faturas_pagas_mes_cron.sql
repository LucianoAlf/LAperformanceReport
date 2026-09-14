-- Cron diário do modo pagas_no_mes (faturas pagas por data de pagamento).
-- Corre às 4h BRT (7h UTC), 1h depois do sync principal, para capturar
-- adiantamentos e cheques pré-datados pagos no dia anterior.
-- Roda as 3 unidades de uma vez (a edge itera internamente).

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname like 'sync-faturas-pagas-no-mes-%'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('sync-faturas-pagas-no-mes-diario', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ),
    body := jsonb_build_object(
      'mode', 'pagas_no_mes',
      'competencias', jsonb_build_array(
        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo'), 'YYYY-MM-DD'),
        to_char(date_trunc('month', (now() at time zone 'America/Sao_Paulo') - interval '1 month'), 'YYYY-MM-DD')
      )
    ),
    timeout_milliseconds := 300000
  );
$cron$);
