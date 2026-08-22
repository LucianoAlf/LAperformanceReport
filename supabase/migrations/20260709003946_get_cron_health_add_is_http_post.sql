-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

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
