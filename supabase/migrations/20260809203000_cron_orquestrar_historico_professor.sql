-- Cron do pipeline de histórico do professor (jobid 129 em produção).
--
-- ⚠️ Os DOIS headers são necessários e por motivos diferentes:
--   `Authorization` → a edge tem `verify_jwt = true`; sem ele o gateway devolve 401
--      ANTES do código rodar e o `pg_cron` marca 'succeeded' assim mesmo (foi o que
--      matou `sync-inadimplencia-emusys` por 13 dias sem ninguém ver).
--   `x-sync-token`  → é o que a PRÓPRIA edge exige em `origemAutorizada`.
--
-- ⚠️ Os dois vêm do VAULT, não literais: `cron.job` tem leitura PÚBLICA
--    (relacl contém '=r/supabase_admin'), então segredo no comando vazaria para
--    qualquer usuário autenticado. Pelo mesmo motivo NÃO se usa a service_role aqui.
--
-- Cadência :07 e :37 foge do topo da hora e da meia hora, onde moram os outros crons que
-- batem no Emusys (60 req/min por IP, compartilhado). Quando não há o que fazer a edge
-- sai em ~150 ms sem tocar na API; a política de cadência real (backfill diário,
-- reconstrução semanal) mora dentro da edge, não no schedule.
select cron.schedule(
  'orquestrar-historico-professor',
  '7,37 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/orquestrar-historico-professor',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'x-sync-token', (select decrypted_secret from vault.decrypted_secrets where name='sync_matriculas_admin_token')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
