-- O mês SEGUINTE nunca teve produtor horário, e desde 17/09 a canônica depende dele (26/09/2026)
--
-- Sintoma (FINANCEIRO de Campo Grande, 26/09, Jhon): dois comprovantes seguidos
-- travaram com "não consegui confirmar a fatura na fonte oficial" e todo "pode"
-- foi recusado — Daniel Mynssem Mendes (parcela 09/2026, R$ 397) e Iolanda Lopes
-- Souza (parcela 10/2026, R$ 380, paga adiantada). As duas faturas existem.
--
-- 🔴 RAIZ (medida em sync_runs e cron.job): `sol_caixa_parcela_canonica`
-- (regra de 17/09) consulta o MÊS SEGUINTE para pegar baixa antecipada e recusa
-- (`fonte_competencia_futura_indisponivel`) quando ele não está fresco. Só que
-- os produtores do espelho financeiro cobrem:
--   financeiro-sync-atual-15m        mês corrente        a cada 15 min, vale 30 min
--   financeiro-sync-anteriores-60m   2 meses anteriores  a cada hora,   vale 75 min
-- e NENHUM cobre o mês seguinte. Ele só é buscado por `internal_refresh`
-- (~11h17 UTC, 1x por dia, validade de 30 min) — fica "stale" de ~08h47 BRT em
-- diante, TODO dia. A regra passou a exigir um dado que ninguém mantinha fresco.
-- Só apareceu agora porque o bloco do runtime da Sol que consulta a canônica com
-- competência declarada entrou no ar no deploy de 26/09 00h19.
--
-- FIX na FONTE, não no consumidor: o mês seguinte entra no ciclo horário. A edge
-- `sync-faturas-emusys` já define validade por produtor — `cron_financeiro_previous_60m`
-- vale 4.500 s (75 min), maior que a cadência de 60 min ("o prazo precisa ser
-- maior que a cadência do produtor", comentário da própria edge) —, então o mês
-- seguinte passa a ficar fresco o dia inteiro SEM deploy de edge.
--
-- ⚠️ O nome do job ("anteriores") fica, de propósito: há monitor e documentação
-- que o citam pelo nome; este arquivo declara o que ele cobre hoje.
-- ⚠️ Custo: +1 competência por hora nas 3 unidades (~390 faturas por unidade no
-- mês seguinte). O mesmo ciclo roda saudável há semanas (42 execuções com
-- sucesso em 48h antes desta mudança).
-- ⚠️ Guarda de identidade pelo NOME do job, nunca só pelo id: numa restauração o
-- id pode trocar de dono e o alter_job reagendaria o job errado em silêncio.
-- ⚠️ Janela sem produtor continua igual à do mês corrente (09h e 10h UTC, fora do
-- expediente), herdada do mesmo agendamento.

do $mig$
declare
  v_id bigint;
  v_cmd text;
  v_de text := $de$        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '2 months', 'YYYY-MM-01')
      ),$de$;
  v_para text := $para$        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '2 months', 'YYYY-MM-01'),
        -- mes SEGUINTE (26/09/2026): a canonica depende dele desde 17/09
        to_char(date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month', 'YYYY-MM-01')
      ),$para$;
begin
  select jobid, command into v_id, v_cmd from cron.job where jobname = 'financeiro-sync-anteriores-60m';
  if v_id is null then raise exception 'JOB_AUSENTE: financeiro-sync-anteriores-60m'; end if;
  if position($x$interval '1 month', 'YYYY-MM-01')$x$ in v_cmd) > 0
     and position('+ interval' in v_cmd) > 0 then
    raise notice 'mes seguinte ja presente -- nada a fazer';
    return;
  end if;
  if (length(v_cmd) - length(replace(v_cmd, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_COMPETENCIAS: esperava 1 ocorrencia no job %', v_id;
  end if;
  perform cron.alter_job(v_id, command := replace(v_cmd, v_de, v_para));
end $mig$;

-- Prova no mesmo passo: o comando novo tem as 3 competências e nada mais mudou.
do $prova$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'financeiro-sync-anteriores-60m';
  if position('+ interval ''1 month''' in v_cmd) = 0 then raise exception 'PROVA: mes seguinte ausente'; end if;
  if position('cron_financeiro_previous_60m' in v_cmd) = 0 then raise exception 'PROVA: trigger_source mudou'; end if;
  if (length(v_cmd) - length(replace(v_cmd, 'to_char(date_trunc', ''))) / length('to_char(date_trunc') <> 3 then
    raise exception 'PROVA: esperava 3 competencias';
  end if;
end $prova$;
