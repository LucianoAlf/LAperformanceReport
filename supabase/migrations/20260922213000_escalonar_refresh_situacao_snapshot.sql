-- Os 3 crons de refresh do snapshot de situacao (268 CG, 269 Barra, 270 Recreio) rodavam
-- `*/5 * * * *` -- ou seja, os TRES no MESMO segundo, a cada 5 minutos. Cada um faz
-- delete + insert da unidade inteira (~1.500 linhas; 28.310 insercoes acumuladas).
--
-- Medido em 22/09/2026: a duracao acompanha a carga do dia -- 2,1s de madrugada, 5,5s as
-- 14h UTC, 23,6s as 19h -- e quando a carga do app se soma, os tres juntos chegaram a
-- 87s / 92s / 96s na MESMA janela (20h45). Com o pool do PostgREST ocupado por isso, TODA
-- leitura vira 503 (salas, cursos, professores, a propria lista de alunos) e as RPCs de
-- KPI estouram o statement_timeout de 8s do papel `authenticated` com 57014.
--
-- A correcao NAO muda frequencia nem calculo: so deixa de triplicar a carga no mesmo
-- instante. CG no minuto 0, Barra no 2, Recreio no 4, mantendo o ciclo de 5 minutos, o
-- mesmo padrao de rodizio que `sync-matriculas-*` (02:00/02:20/02:40) ja usa.
--
-- ROLLBACK (volta ao estado anterior, os tres simultaneos):
--   select cron.alter_job(268, schedule => '*/5 * * * *');
--   select cron.alter_job(269, schedule => '*/5 * * * *');
--   select cron.alter_job(270, schedule => '*/5 * * * *');
do $$
declare v_nome text;
begin
  -- guarda de identidade: alterar cron por ID sem conferir o nome e' como o jobid mudar
  -- de dono numa restauracao e a migration reagendar o job errado, em silencio.
  select jobname into v_nome from cron.job where jobid = 268;
  if v_nome is distinct from 'refresh-situacao-snapshot-cg' then
    raise exception 'jobid 268 nao e o snapshot de CG (e: %)', coalesce(v_nome,'<inexistente>');
  end if;
  select jobname into v_nome from cron.job where jobid = 269;
  if v_nome is distinct from 'refresh-situacao-snapshot-barra' then
    raise exception 'jobid 269 nao e o snapshot da Barra (e: %)', coalesce(v_nome,'<inexistente>');
  end if;
  select jobname into v_nome from cron.job where jobid = 270;
  if v_nome is distinct from 'refresh-situacao-snapshot-recreio' then
    raise exception 'jobid 270 nao e o snapshot do Recreio (e: %)', coalesce(v_nome,'<inexistente>');
  end if;

  perform cron.alter_job(268, schedule => '0,5,10,15,20,25,30,35,40,45,50,55 * * * *');
  perform cron.alter_job(269, schedule => '2,7,12,17,22,27,32,37,42,47,52,57 * * * *');
  perform cron.alter_job(270, schedule => '4,9,14,19,24,29,34,39,44,49,54,59 * * * *');
end $$;
