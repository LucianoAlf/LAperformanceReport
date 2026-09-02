-- supabase/migrations/20260902122500_cron_fechamento_dia1.sql
--
-- Cron do fechamento mensal, dia 1o as 12:00 UTC = 09:00 BRT.
-- NASCE DESLIGADO: so e ligado apos o ensaio de setembro e OK do Hugo.
--
-- O jobid 83 (22h do ultimo dia) e DESATIVADO, nao deletado -- o orquestrador
-- chama fechar_competencia_mensal_automatico() como passo 0, entao manter os
-- dois ativos duplicaria a captura.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'fechamento-mensal-dia1';

  if v_jobid is null then
    perform cron.schedule(
      'fechamento-mensal-dia1',
      '0 12 1 * *',
      'select public.fechar_competencia_mensal_dia1_v1();'
    );
    select jobid into v_jobid from cron.job where jobname = 'fechamento-mensal-dia1';
  end if;

  perform cron.alter_job(v_jobid, active => false);
end;
$$;

-- Desativa o cron das 22h do ultimo dia (jobid 83).
do $$
declare
  v_antigo bigint;
begin
  select jobid into v_antigo from cron.job where jobname = 'fechamento-mensal-automatico';
  if v_antigo is not null then
    perform cron.alter_job(v_antigo, active => false);
  end if;
end;
$$;
