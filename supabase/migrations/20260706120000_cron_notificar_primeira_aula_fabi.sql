-- Cron diário: resumo das primeiras aulas (calouros com presença detectada, pendentes
-- de pesquisa) enviado por WhatsApp para a Fabi, via edge notificar-primeira-aula-fabi.
-- Reaproveita a RPC get_candidatos_pesquisa_primeira_aula (mesma da aba Pós-1ª Aula).
-- 11:00 UTC = 08:00 BRT (após o sync-presenca noturno ~23:52 UTC).
-- Anon key hardcoded como fallback (chave pública, sem risco). pg_cron/pg_net já instalados.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notificar-primeira-aula-fabi-diario') THEN
    PERFORM cron.unschedule('notificar-primeira-aula-fabi-diario');
  END IF;
END $$;

SELECT cron.schedule(
  'notificar-primeira-aula-fabi-diario',
  '0 11 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/notificar-primeira-aula-fabi',
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
