-- Remove job anterior de mesmo nome (idempotente).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'disparar-pesquisa-1a-aula-diario';

SELECT cron.schedule(
  'disparar-pesquisa-1a-aula-diario',
  '0 14 * * *',  -- 14:00 UTC = 11:00 BRT
  $$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/disparar-pesquisa-1a-aula-auto',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.anon_key', true),
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);
