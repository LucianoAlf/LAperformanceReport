-- Cron que pontua o risco de evasao dos alunos ativos, a cada 3 dias.
-- Chama a edge function calcular-risco-evasao (modelo Random Forest), que grava
-- em public.risco_evasao. A cada 3 dias (nao diario): o modelo preve risco em
-- ~30 dias e a presenca muda devagar — 3 dias e responsivo o bastante e evita
-- inchar o disco (cada rodada grava ~1 MB por causa do jsonb fatores).
--
-- Roda 05:00 UTC (02:00 BRT) — depois do sync de presenca (~23:52 UTC), sync de
-- matriculas (~02:40 UTC... na verdade antes; ver nota) e health score (04:00 UTC).
-- Auth: anon key no header (a function usa a service key dela internamente pro
-- upsert) — mesmo padrao dos outros crons do projeto.
-- Retencao: mantem 180 dias de historico (~60 snapshots) pra o disco estabilizar.

SELECT cron.schedule(
  'calcular-risco-evasao-3d',
  '0 5 */3 * *',
  $cron$
    DELETE FROM public.risco_evasao WHERE calculado_em < CURRENT_DATE - 180;
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/calcular-risco-evasao',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.anon_key', true),
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
