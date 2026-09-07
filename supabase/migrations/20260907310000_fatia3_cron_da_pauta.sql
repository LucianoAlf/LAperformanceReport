-- FATIA 3, passo 3 — o cron da pauta (07/09/2026).
--
-- ⚠️ O cron NASCE LIGADO e a automação nasce DESLIGADA, e isso é de propósito:
--    assim o caminho inteiro é exercitado todo dia (agenda, pauta, descoberta
--    de grupo, teto) sem mandar nada, e o primeiro envio real é um `update` de
--    uma linha — não um deploy. Ligar automação por deploy é como se descobre,
--    tarde, que o caminho tinha um erro de digitação.
--
--      update automacoes_config set ativo = true where slug = 'radar_pauta_grupo';
--
-- ⚠️ 12:00 e 19:00 UTC = 09:00 e 16:00 BRT, que são exatamente os `horarios`
--    dos destinatários. Segunda a sábado: domingo a agenda barraria de todo
--    jeito, mas não custa nada não acordar o banco à toa.
--
-- ⚠️ Roda com `p_dry_run => false`. Com o interruptor off isso devolve
--    `{"ok":false,"motivo":"desligado"}` e não escreve nada — o ensaio de
--    verdade é chamar a função à mão com `true`.

do $cron$
declare v_id bigint;
begin
  -- ⚠️ idempotente: `cron.schedule` com nome repetido substitui o anterior,
  --    mas eu confiro antes para o número do job aparecer no log.
  select jobid into v_id from cron.job where jobname = 'radar-pauta-grupo';
  if v_id is not null then
    raise notice 'cron radar-pauta-grupo ja existia (jobid %) — sera substituido', v_id;
  end if;

  select cron.schedule('radar-pauta-grupo', '0 12,19 * * 1-6',
                       'select public.radar_enfileirar_pauta_v1(false);') into v_id;
  raise notice 'cron % criado: radar-pauta-grupo 12:00 e 19:00 UTC (09h/16h BRT), seg-sab', v_id;
end $cron$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_ativo boolean; v_sched text; v_switch boolean; v jsonb;
begin
  select active, schedule into v_ativo, v_sched from cron.job where jobname='radar-pauta-grupo';
  if not coalesce(v_ativo,false) then raise exception 'o cron nao ficou ativo'; end if;
  if v_sched <> '0 12,19 * * 1-6' then raise exception 'horario inesperado: %', v_sched; end if;

  -- 🔴 o interruptor TEM de estar off: cron novo nao pode comecar falando
  select ativo into v_switch from automacoes_config where slug='radar_pauta_grupo';
  if coalesce(v_switch,false) then
    raise exception 'o interruptor esta LIGADO — a pauta comecaria a sair sem ninguem autorizar';
  end if;

  -- e o que o cron chama, chamado agora, tem de recusar pelo interruptor
  v := radar_enfileirar_pauta_v1(false);
  if v->>'motivo' is distinct from 'desligado' then
    raise exception 'o comando do cron nao recusou pelo interruptor: %', v;
  end if;

  raise notice 'prova: cron ativo em % · interruptor off · o comando dele recusa hoje', v_sched;
end $prova$;
