-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.
-- ATENCAO: SEGREDOS REDIGIDOS — valores de token/chave/senha substituidos por
-- <REDACTED:...>. O SQL aqui NAO e executavel como esta; o valor real vive no
-- ambiente (secrets/vault), nunca no repo. Ver issue #201.

-- Remover job diário existente
SELECT cron.unschedule('sync-presenca-emusys');

-- Criar job semanal: segunda 01:00 UTC = domingo 22:00 BRT
SELECT cron.schedule(
  'sync-presenca-emusys',
  '0 1 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-presenca-emusys',
    headers := '{"Content-Type": "application/json", "apikey": "<REDACTED:jwt>"}'::jsonb,
    body := '{"dias": 7}'::jsonb
  );
  $$
);
