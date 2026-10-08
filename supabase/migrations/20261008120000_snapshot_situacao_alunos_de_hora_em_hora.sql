-- Snapshot da situacao do aluno: de 15 em 15 min para de hora em hora (CP8, decisao do Luciano 08/10).
--
-- MEDIDO (07/10/2026, pg_stat_statements desde 28/09): `refresh_situacao_alunos_snapshot` rodava
-- 288 vezes por dia (3 unidades x 96) contra ~52 leituras/dia de `get_situacao_alunos_v1` (Sol, TOM,
-- Lia, app) -- recalculado 5x mais do que lido. 3.281 s de banco em 9 dias, 1,3 s de media, 18 s de
-- pico. Era o maior custo de fundo restante.
--
-- AGORA: uma vez por hora por unidade, mantendo o escalonamento (CG :00, Barra :05, Recreio :10 --
-- nunca no mesmo minuto, regra de 22/09). Corte esperado: ~75% do custo.
--
-- ⚠️ EFEITO ACEITO: o dado do snapshot (inadimplencia, presenca, contrato, comunidade) fica ate 1 h
-- atrasado para os agentes, em vez de 15 min. Na virada do dia em UTC (21h BRT) a referencia muda e,
-- ate o refresh seguinte, a RPC calcula ao vivo (mais lenta, mas correta) -- antes isso durava ate
-- 15 min, agora ate 1 h.
--
-- Guarda: confere o NOME de cada job antes de reagendar (id pode trocar de dono numa restauracao).
-- Rollback: voltar os schedules para '0,15,30,45', '5,20,35,50' e '10,25,40,55'.

do $migration$
declare
  r record;
begin
  for r in
    select * from (values
      ('refresh-situacao-snapshot-cg',      '0 * * * *'),
      ('refresh-situacao-snapshot-barra',   '5 * * * *'),
      ('refresh-situacao-snapshot-recreio', '10 * * * *')
    ) v(nome, agenda)
  loop
    if not exists (select 1 from cron.job where jobname = r.nome) then
      raise exception 'SNAPSHOT_HORARIO: job % nao encontrado', r.nome;
    end if;
    perform cron.alter_job((select jobid from cron.job where jobname = r.nome), schedule => r.agenda);
  end loop;
end
$migration$;
