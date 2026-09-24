-- Os 3 crons de refresh do snapshot de situacao (268 CG, 269 Barra, 270 Recreio) rodavam de
-- 5 em 5 minutos. A migration 20260922213000 ja os escalonou (deixaram de disparar no mesmo
-- segundo); esta reduz a FREQUENCIA, que o escalonamento nao tocou.
--
-- POR QUE 15 MINUTOS -- medido em 23/09/2026:
--
-- 1) Custa 701x mais encher o cache do que le-lo. Na janela do pg_stat_statements:
--       ALIMENTA o snapshot: 113 chamadas, 350,5 s, media 3.102 ms
--       LE      o snapshot:    7 chamadas,   0,5 s, media    74 ms
--    Sao 0,03% das chamadas do banco consumindo 11,5% do tempo total.
--
-- 2) NENHUMA fonte do snapshot muda a cada 5 minutos. A mais rapida e' de 15 min:
--       sync-metadados-aulas-15m-u0/u1/u2  -> 15 min  (presenca/aulas)
--       financeiro-sync-atual-15m          -> 15 min  (faturas)
--       sincronizar-comunidade-whatsapp    -> 1x/dia
--       sync-contrato-assinatura-*         -> 1x/dia
--       sync-matriculas-*                  -> 1x/dia
--    Recalcular a cada 5 min reprocessa dado identico em 2 de cada 3 ciclos, por construcao.
--
-- 3) Comparacao snapshot x calculo ao vivo em 400 linhas de CG (22/09): ZERO divergencia em
--    status_operacional, cadastro_completo, inadimplente, presenca, comunidade e contrato.
--
-- NAO muda o calculo, nem o conteudo, nem quem le. Muda so quantas vezes recalcula.
-- O escalonamento de 5 min entre unidades e' PRESERVADO (0 / 5 / 10), o mesmo padrao que
-- sync-metadados-aulas-15m-u0/u1/u2 ja usa.
--
-- REDE DE SEGURANCA: get_situacao_alunos_v1 tem fallback ao vivo quando nao acha snapshot --
-- sem cache ela fica mais lenta (3,2 s em vez de 244 ms), nunca errada nem vazia.
--
-- ROLLBACK (volta aos 5 minutos, mantendo o escalonamento):
--   select cron.alter_job(268, schedule => '0,5,10,15,20,25,30,35,40,45,50,55 * * * *');
--   select cron.alter_job(269, schedule => '2,7,12,17,22,27,32,37,42,47,52,57 * * * *');
--   select cron.alter_job(270, schedule => '4,9,14,19,24,29,34,39,44,49,54,59 * * * *');
do $$
declare v_nome text;
begin
  -- guarda de identidade: alterar cron por ID sem conferir o nome reagenda o job errado em
  -- silencio se o jobid trocar de dono numa restauracao.
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

  perform cron.alter_job(268, schedule => '0,15,30,45 * * * *');
  perform cron.alter_job(269, schedule => '5,20,35,50 * * * *');
  perform cron.alter_job(270, schedule => '10,25,40,55 * * * *');
end $$;

-- guarda de saida: os tres tem de estar na nova cadencia e ATIVOS.
do $$
declare v_ok int;
begin
  select count(*) into v_ok from cron.job
  where jobid in (268,269,270) and active
    and schedule in ('0,15,30,45 * * * *','5,20,35,50 * * * *','10,25,40,55 * * * *');
  if v_ok <> 3 then
    raise exception 'esperava 3 crons de snapshot em 15min e ativos, encontrei %', v_ok;
  end if;
end $$;
