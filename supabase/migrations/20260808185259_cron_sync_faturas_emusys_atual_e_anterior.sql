-- O sync de faturas NUNCA teve cron. Entre os 54 jobs do pg_cron havia sync de
-- presenca, matriculas, grade, professores, disciplinas, metadados e agenda --
-- nenhum de faturas. Ele so rodava por `internal_refresh` (disparo interno da
-- aplicacao), que sincroniza apenas a COMPETENCIA CORRENTE.
--
-- Consequencia medida em 2026-08-08: julho parou de ser atualizado em 23/07,
-- quando agosto virou o mes corrente. Mas o aluno continua pagando a fatura de
-- julho DURANTE agosto -- foram encontradas 39 faturas pagas entre 24/07 e 05/08
-- que o banco ainda dava como abertas, e 30 faturas que nem existiam no espelho.
-- Efeito no faturamento de julho: R$ 15.942,90 a menos do que o real.
--
-- Agravante: `fechamento-mensal-automatico` (jobid 83) roda dia 1 as 01:00 UTC,
-- ou seja, no minuto seguinte ao fim do mes. O snapshot financeiro nascia antes
-- de qualquer pagamento tardio existir -- ele NUNCA teve chance de estar certo.
-- Nao era bug de julho: acontecia todo mes.
--
-- Dois jobs, de proposito:
--   1. competencia ATUAL as 00:30 UTC  -> roda ANTES do fechamento das 01:00 UTC
--      do dia 1, entao o snapshot nasce com a foto mais fresca possivel.
--   2. competencia ANTERIOR as 03:00 UTC -> captura pagamento tardio ao longo de
--      todo o mes seguinte. E este que faltava.
--
-- Authorization + x-sync-token juntos: se um redeploy resetar verify_jwt p/ true,
-- o gateway aceita o JWT e a edge segue autenticando pelo token internamente
-- (licao do incidente sync-inadimplencia-emusys, que ficou 13 dias morto em 401
-- enquanto o pg_cron marcava `succeeded`).
--
-- VALIDADO em 2026-08-08 disparando o comando de verdade, nao pelo active=true:
-- sync_runs registrou succeeded, requested_by='sync_admin_token', 1.042 faturas
-- atualizadas, 28 inseridas, snapshot_complete=true, em 27 segundos.
-- CONFERIR SEMPRE POR sync_runs, nunca pelo pg_cron.

select cron.schedule(
  'sync-faturas-competencia-atual',
  '30 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Anon key vem do vault, nao hardcoded: o gitleaks barra JWT commitado no
      -- repo (e com razao, ainda que a anon key seja publica por natureza).
      -- Os crons antigos tem a chave literal no comando; ao versiona-los, migrar
      -- para esta forma.
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key'
      ),
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
      )
    ),
    body := jsonb_build_object(
      'competencia', to_char(date_trunc('month', (now() at time zone 'America/Sao_Paulo')), 'YYYY-MM-01'),
      'trigger_source', 'cron_competencia_atual'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);

select cron.schedule(
  'sync-faturas-competencia-anterior',
  '0 3 * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-faturas-emusys',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- Anon key vem do vault, nao hardcoded: o gitleaks barra JWT commitado no
      -- repo (e com razao, ainda que a anon key seja publica por natureza).
      -- Os crons antigos tem a chave literal no comando; ao versiona-los, migrar
      -- para esta forma.
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'supabase_anon_key'
      ),
      'x-sync-token', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'sync_matriculas_admin_token'
      )
    ),
    body := jsonb_build_object(
      'competencia', to_char(date_trunc('month', (now() at time zone 'America/Sao_Paulo')) - interval '1 month', 'YYYY-MM-01'),
      'trigger_source', 'cron_competencia_anterior'
    ),
    timeout_milliseconds := 240000
  );
  $cron$
);
