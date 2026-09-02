-- supabase/migrations/20260902122500_cron_fechamento_dia1.sql
--
-- Cron do fechamento mensal, dia 1o as 12:15 UTC = 09:15 BRT.
-- NASCE DESLIGADO: so e ligado apos o ensaio de setembro e OK do Hugo.
--
-- Horario com folga: as 12:00 UTC a fonte financeira mais fresca (sync de
-- faturas, que roda ao minuto :07 de cada hora) so vence as 12:21 -- apenas
-- 21 min de margem. As 12:15 a folga passa a ~1h, sem abrir mao de continuar
-- sendo "09h BRT" para efeitos praticos.
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
      '15 12 1 * *',
      'select public.fechar_competencia_mensal_dia1_v1();'
    );
    select jobid into v_jobid from cron.job where jobname = 'fechamento-mensal-dia1';

    -- Desliga so aqui, no momento da CRIACAO. Reaplicar esta migration
    -- depois que alguem ligar o cron (ex.: apos o OK do ensaio) nao pode
    -- desligar de novo em silencio -- e o mesmo tipo de falha muda que este
    -- projeto ja sofreu com deploy resetando verify_jwt.
    perform cron.alter_job(v_jobid, active => false);
  end if;
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
