-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

select cron.schedule(
  'warm-enviar-mensagem-admin',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/enviar-mensagem-admin',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"ping": true}'::jsonb
    );
  $$
);
