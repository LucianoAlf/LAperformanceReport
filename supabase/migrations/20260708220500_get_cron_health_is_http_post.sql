-- Corrige o heuristico de "nao medido": duracao <=20ms e uma proxy fraca (SQL direto
-- rapido tambem cai abaixo disso, ex: reset-sol-stuck-messages, fabio-retry-fila). O
-- sinal correto e se o comando do job dispara via net.http_post (fire-and-forget de
-- verdade: pg_cron so confirma o enqueue do POST, nunca o resultado da edge function)
-- vs. uma chamada SQL direta (SELECT fn(), UPDATE), cujo succeeded/failed do pg_cron
-- reflete o resultado real da execucao.
DROP FUNCTION IF EXISTS public.get_cron_health();

CREATE FUNCTION public.get_cron_health()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, ultimo_status text, ultima_execucao_brt timestamp with time zone, ultima_duracao_ms integer, return_message text, is_http_post boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  WITH ultima_run AS (
    SELECT DISTINCT ON (jobid)
      jobid, status, return_message, start_time, end_time
    FROM cron.job_run_details
    ORDER BY jobid, start_time DESC
  )
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    r.status,
    r.start_time AT TIME ZONE 'America/Sao_Paulo',
    EXTRACT(milliseconds FROM (r.end_time - r.start_time))::int,
    r.return_message,
    position('net.http_post' in lower(j.command)) > 0 as is_http_post
  FROM cron.job j
  LEFT JOIN ultima_run r ON r.jobid = j.jobid
  ORDER BY j.jobname;
$function$;
