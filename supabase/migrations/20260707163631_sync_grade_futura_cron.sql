-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.
-- ATENCAO: SEGREDOS REDIGIDOS — valores de token/chave/senha substituidos por
-- <REDACTED:...>. O SQL aqui NAO e executavel como esta; o valor real vive no
-- ambiente (secrets/vault), nunca no repo. Ver issue #201.

-- Idempotência: remove agendamentos anteriores destes jobs, se existirem.
do $$
declare j text;
begin
  foreach j in array array[
    'sync-grade-futura-cg',
    'sync-grade-futura-barra',
    'sync-grade-futura-recreio'
  ] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

-- Campo Grande (unidade_index 0) — 06:00 UTC (03:00 BRT)
select cron.schedule(
  'sync-grade-futura-cg',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 0}'::jsonb
  );
  $$
);

-- Barra (unidade_index 1) — 06:05 UTC
select cron.schedule(
  'sync-grade-futura-barra',
  '5 6 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 1}'::jsonb
  );
  $$
);

-- Recreio (unidade_index 2) — 06:10 UTC
select cron.schedule(
  'sync-grade-futura-recreio',
  '10 6 * * *',
  $$
  select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 2}'::jsonb
  );
  $$
);
