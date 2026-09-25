-- Queda do banco em 25/09/2026 (17h10–17h27 BRT) e auditoria de desempenho.
--
-- 1) dashboard-aquecer-caches (jobid 305, */4) DESLIGADO — nao deletado.
--    Recalculava ~70 RPCs pesadas a cada 4 min: 9.420 s de banco em 24h (~2/3 de todo o
--    tempo de cron), media subindo de 17 s para 34 s. O cache por versao e invalidado
--    ~500 vezes/hora (leads 347/h, aulas 124/h), entao o aquecedor nunca achava cache
--    valido: era recalculo completo 360x/dia com ou sem usuario. O cache por versao segue
--    funcionando sob demanda; so a primeira leitura apos uma mudanca paga o calculo.
--    Reverter: select cron.alter_job(<jobid>, active => true);
--
-- 2) sync-run-items-expurgo-diario (jobid 304) de '40 6 * * *' para '*/5 9 * * *'
--    (06h00–06h55 BRT, 12 rodadas de ate 1 mi de itens). Em 25/09 havia 7.663.143 itens
--    ja consolidados e prontos (7.007 runs); 1 rodada/dia levaria ~8 dias. A janela
--    09h UTC e a lacuna do sync-faturas-fila-worker ('* 0-8,11-23'), entao o
--    ALTER TABLE ... DISABLE TRIGGER do expurgo nao disputa lock com o publish.
--    Em regime (~245 mil itens/dia entrando) as rodadas extras saem com runs=0.
--    ⚠️ DELETE nao devolve disco: o espaco so volta ao SO com VACUUM FULL/pg_repack
--    (decisao separada — trava a tabela). Sem isso, o autovacuum ao menos torna o espaco
--    reutilizavel e a tabela para de crescer.
--    Reverter: select cron.alter_job(<jobid>, schedule => '40 6 * * *');
--
-- Guarda por jobname: alter_job por id sem conferir o dono reagenda o job errado.

do $$
declare
  v_aquecer bigint;
  v_expurgo bigint;
begin
  select jobid into v_aquecer from cron.job where jobname = 'dashboard-aquecer-caches';
  select jobid into v_expurgo from cron.job where jobname = 'sync-run-items-expurgo-diario';

  if v_aquecer is null then
    raise exception 'job dashboard-aquecer-caches nao encontrado';
  end if;
  if v_expurgo is null then
    raise exception 'job sync-run-items-expurgo-diario nao encontrado';
  end if;

  perform cron.alter_job(v_aquecer, active => false);
  perform cron.alter_job(v_expurgo, schedule => '*/5 9 * * *');

  if (select active from cron.job where jobid = v_aquecer) then
    raise exception 'aquecedor continua ativo';
  end if;
  if (select schedule from cron.job where jobid = v_expurgo) <> '*/5 9 * * *' then
    raise exception 'agenda do expurgo nao mudou';
  end if;
end $$;
