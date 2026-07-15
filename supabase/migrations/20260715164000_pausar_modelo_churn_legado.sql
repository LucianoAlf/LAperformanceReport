-- O modelo legado usa aluno_presenca sem distinguir falta real de chamada ausente.
-- Preserva os resultados históricos, mas impede novas decisões até o corte canônico.

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
  FROM cron.job
  WHERE jobname = 'calcular-risco-evasao-3d';

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Cron calcular-risco-evasao-3d nao encontrado';
  END IF;

  PERFORM cron.alter_job(job_id := v_job_id, active := false);
END;
$$;
