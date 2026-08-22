-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.
-- ATENCAO: SEGREDOS REDIGIDOS — valores de token/chave/senha substituidos por
-- <REDACTED:...>. O SQL aqui NAO e executavel como esta; o valor real vive no
-- ambiente (secrets/vault), nunca no repo. Ver issue #201.


-- =============================================
-- Migração: Cron Jobs para Alertas WhatsApp
-- Data: 2026-01-29
-- =============================================

-- Garantir extensões habilitadas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Conceder permissões necessárias
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Job 1: Verificar tarefas atrasadas (a cada 2 horas, das 8h às 20h - horário UTC-3 = 11h às 23h UTC)
SELECT cron.schedule(
  'alertas-tarefas-atrasadas',
  '0 11,13,15,17,19,21,23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/projeto-alertas-whatsapp',
    headers := '{"Content-Type": "application/json", "apikey": "<REDACTED:jwt>"}'::jsonb,
    body := '{"action": "tarefa_atrasada"}'::jsonb
  );
  $$
);

-- Job 2: Alertas diários (8h BRT = 11h UTC - tarefas vencendo e projetos parados)
SELECT cron.schedule(
  'alertas-diarios',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/projeto-alertas-whatsapp',
    headers := '{"Content-Type": "application/json", "apikey": "<REDACTED:jwt>"}'::jsonb,
    body := '{"action": "all"}'::jsonb
  );
  $$
);

-- Job 3: Resumo semanal (Segunda às 9h BRT = 12h UTC)
SELECT cron.schedule(
  'resumo-semanal',
  '0 12 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/projeto-alertas-whatsapp',
    headers := '{"Content-Type": "application/json", "apikey": "<REDACTED:jwt>"}'::jsonb,
    body := '{"action": "resumo_semanal"}'::jsonb
  );
  $$
);
