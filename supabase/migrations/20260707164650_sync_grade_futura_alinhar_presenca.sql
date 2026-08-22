-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.
-- ATENCAO: SEGREDOS REDIGIDOS — valores de token/chave/senha substituidos por
-- <REDACTED:...>. O SQL aqui NAO e executavel como esta; o valor real vive no
-- ambiente (secrets/vault), nunca no repo. Ver issue #201.

-- Reagenda a grade futura pra rodar logo depois da presença de cada unidade
-- (10 min de folga), em vez de madrugada — seguindo também o padrão de sábado.
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

-- Barra: presença 19h50 BRT (seg-sex) -> grade futura 20h00 BRT = 23:00 UTC, sem virada de dia
select cron.schedule(
  'sync-grade-futura-barra', '0 23 * * 1-5',
  $$select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 1}'::jsonb
  );$$
);

-- CG: presença 20h50 BRT (seg-sex) -> grade futura 21h00 BRT = 00:00 UTC do dia seguinte (dow desloca +1)
select cron.schedule(
  'sync-grade-futura-cg', '0 0 * * 2-6',
  $$select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 0}'::jsonb
  );$$
);

-- Recreio: presença 20h52 BRT (seg-sex) -> grade futura 21h02 BRT = 00:02 UTC do dia seguinte (dow desloca +1)
select cron.schedule(
  'sync-grade-futura-recreio', '2 0 * * 2-6',
  $$select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 2}'::jsonb
  );$$
);

-- Sábado: CG presença 14h50 -> grade futura 15h00 BRT = 18:00 UTC (sem virada)
select cron.schedule(
  'sync-grade-futura-cg-sabado', '0 18 * * 6',
  $$select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 0}'::jsonb
  );$$
);

-- Sábado: Recreio presença 14h52 -> grade futura 15h02 BRT = 18:02 UTC (sem virada)
select cron.schedule(
  'sync-grade-futura-recreio-sabado', '2 18 * * 6',
  $$select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 2}'::jsonb
  );$$
);

-- Sábado: Barra presença 15h50 -> grade futura 16h00 BRT = 19:00 UTC (sem virada)
select cron.schedule(
  'sync-grade-futura-barra-sabado', '0 19 * * 6',
  $$select net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/sync-grade-futura-emusys',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <REDACTED:jwt>"}'::jsonb,
    body := '{"janela_dias": 35, "unidade_index": 1}'::jsonb
  );$$
);
