-- Revarredura anual mensal do espelho financeiro Emusys (pedido Super Folha 2026-09-15).
-- A janela diária cobre só mês corrente + 2 anteriores; mês fechado que a Rose
-- corrigir depois sai do radar. Esta rotina revarre o ano inteiro (jan–hoje) uma
-- vez por mês, dia a dia, com o mesmo controle de pausa/retomada.
-- Corre no dia 1 de cada mês, 3h BRT (6h UTC), uma unidade por vez com timeout de 10 min.
-- A edge ignora dias já revarridos na última semana (não repete o que a janela
-- diária acabou de cobrir) e NÃO sobrescreve a janela diária do resumo.

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname like 'sync-financeiro-emusys-revarredura-anual-%'
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('sync-financeiro-emusys-revarredura-anual-cg', '0 6 1 * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=cg',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{"revarredura_anual": true, "orcamento_segundos": 600}'::jsonb, timeout_milliseconds := 660000
  );
$cron$);
select cron.schedule('sync-financeiro-emusys-revarredura-anual-barra', '15 6 1 * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=barra',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{"revarredura_anual": true, "orcamento_segundos": 600}'::jsonb, timeout_milliseconds := 660000
  );
$cron$);
select cron.schedule('sync-financeiro-emusys-revarredura-anual-recreio', '30 6 1 * *', $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-financeiro-emusys?u=recreio',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_matriculas_admin_token' limit 1)
    ), body := '{"revarredura_anual": true, "orcamento_segundos": 600}'::jsonb, timeout_milliseconds := 660000
  );
$cron$);
