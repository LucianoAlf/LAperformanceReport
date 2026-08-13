-- O auditor-divergencias-cron (jobid 16, `0 * * * *`) batia no timeout PADRAO do
-- `net.http_post` (5000 ms) em TODA execucao. Medido em 13/08/2026 lendo
-- `net._http_response`: 13:00, 14:00, 15:00, 16:00, 17:00 e 18:00 BRT, todas com
--   "Timeout of 5000 ms reached ... HTTP Request/Response time: 4999.9 ms"
-- e `status_code` NULL — a edge NUNCA respondeu dentro da janela.
--
-- ⚠️ POR QUE PASSOU DESPERCEBIDO: `cron.job_run_details` marcava `succeeded` nas 24
-- execucoes do dia, porque o pg_cron so avalia se o `net.http_post` foi ENFILEIRADO — nao
-- se a resposta chegou. Mesmo ponto cego que escondeu o `sync-inadimplencia-emusys` por 13
-- dias (401 silencioso) e o `sync-presenca-emusys` em 02/08. **Cron verde nao prova nada;
-- a resposta real esta em `net._http_response`** (retencao ~6h, e ela NAO guarda a URL —
-- casar pelo horario do agendamento).
--
-- ⚠️ `timeout_milliseconds` e parametro do `net.http_post`, NAO do `cron.alter_job`
-- (`cron.alter_job(16, timeout_milliseconds := ...)` da 42883 function does not exist) —
-- por isso a correcao reescreve o comando do job em vez de so ajustar o agendamento.
--
-- 30s: a edge e de auditoria (varre divergencias), nao interativa, e o intervalo de 1 hora
-- descarta risco de acumulo.
select cron.alter_job(
  16,
  command := $cmd$
    SELECT net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/auditor-divergencias-emusys',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(
          current_setting('app.settings.anon_key', true),
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91cXdiYmVybWx6cXF2dHF3bHVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1Nzg5NTgsImV4cCI6MjA4MzE1NDk1OH0.KGEzs2T-NPBc1DaWjgIVbJkEsjAdluT4q5kHrFvIJus'
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron'),
      timeout_milliseconds := 30000
    );
  $cmd$
);
