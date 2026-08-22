-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Criar job que roda todo dia 1 às 3h da manhã para fazer snapshot do mês anterior
SELECT cron.schedule(
  'snapshot_dados_mensais_mensal',  -- nome do job
  '0 3 1 * *',                       -- cron: minuto 0, hora 3, dia 1, todo mês
  $$
    SELECT snapshot_dados_mensais(
      EXTRACT(YEAR FROM (CURRENT_DATE - INTERVAL '1 day'))::INTEGER,
      EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 day'))::INTEGER
    );
  $$
);
