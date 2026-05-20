-- Cron horário do auditor de divergências.
-- Roda toda hora cheia (minuto 0).
-- Anon key hardcoded como fallback (chave pública usada no frontend, sem risco de segurança).
-- Nota: extensões pg_cron e pg_net já estão instaladas no projeto Supabase.

-- Remover job antigo se existir (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auditor-divergencias-cron') THEN
    PERFORM cron.unschedule('auditor-divergencias-cron');
  END IF;
END $$;

-- Agendar execução horária
SELECT cron.schedule(
  'auditor-divergencias-cron',
  '0 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/auditor-divergencias-emusys',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.anon_key', true),
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $cron$
);
