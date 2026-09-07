-- FATIA 2, passo 5 — o cron passa a rodar a rodada REGISTRADA (07/09/2026).
--
-- 🔴 SEM ISTO, TUDO O QUE FOI FEITO HOJE PARA DE FUNCIONAR AMANHA. A vigencia
--    de um sinal e "o detector daquela regra rodou e reemitiu?". Quem responde
--    isso e a linha em `radar_rodadas`, e so `radar_rodada_diaria_v1` a grava.
--    O cron 192 chama os detectores DIRETO — entao amanha as 09:00 os sinais
--    seriam reemitidos (o `visto_em` andaria) mas nenhuma rodada seria
--    registrada, a ultima boa ficaria a mais de 36h e a view devolveria
--    `sem_rodada` para tudo: **a pauta esvaziaria em silencio**.
--
--    E o modo de falha que a propria view existe para evitar, chegando pela
--    porta dos fundos. Por isso este passo nao e detalhe de arrumacao.
--
-- ⚠️ O cron 196 (comercial) tambem sai, porque `radar_rodada_diaria_v1` ja
--    chama `radar_detectar_sinais_comercial_v1`. Deixa-lo ligado faria a
--    deteccao comercial rodar duas vezes por dia — inofensivo pelo
--    `on conflict`, mas o segundo run mexeria em `visto_em` fora de uma rodada
--    registrada, que e exatamente o tipo de ruido que confunde diagnostico.
--
-- ⚠️ Os crons sao DESATIVADOS, nao deletados (padrao desta casa com o jobid 83
--    do fechamento mensal): se algo der errado amanha, voltar e um `alter_job`,
--    nao uma arqueologia.

do $cron$
declare v_192 text; v_196 text; v_novo bigint;
begin
  select command into v_192 from cron.job where jobid = 192;
  select command into v_196 from cron.job where jobid = 196;

  -- ⚠️ Guarda: se o comando nao for o que eu li, alguem mexeu e eu nao posso
  --    presumir o que ele faz.
  if v_192 is null or v_192 not like '%radar_detectar_sinais_sql_v1%' then
    raise exception 'cron 192 nao e o que eu esperava: %', coalesce(v_192,'(inexistente)');
  end if;
  if v_196 is null or v_196 not like '%radar_detectar_sinais_comercial_v1%' then
    raise exception 'cron 196 nao e o que eu esperava: %', coalesce(v_196,'(inexistente)');
  end if;

  perform cron.alter_job(192, active := false);
  perform cron.alter_job(196, active := false);

  -- mesmo horario do 192, para nao mudar o momento do dia em que a foto e tirada
  select cron.schedule('radar-rodada-diaria', '0 9 * * *',
                       'select public.radar_rodada_diaria_v1();') into v_novo;

  raise notice 'cron % criado (radar-rodada-diaria 09:00 UTC); 192 e 196 desativados, nao deletados', v_novo;
end $cron$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare v_ativo bool; v_192 bool; v_196 bool; v_sem_rodada int;
begin
  select active into v_ativo from cron.job where jobname = 'radar-rodada-diaria';
  select active into v_192   from cron.job where jobid = 192;
  select active into v_196   from cron.job where jobid = 196;

  if not coalesce(v_ativo,false) then raise exception 'a rodada nao ficou ativa'; end if;
  if coalesce(v_192,false) or coalesce(v_196,false) then
    raise exception 'os crons antigos continuam ativos (192=%, 196=%) — rodariam em dobro', v_192, v_196;
  end if;

  -- 🔴 hoje nao pode haver `sem_rodada`: se houver, a rodada de agora nao valeu
  select count(*) into v_sem_rodada from vw_radar_sinal_vigencia_v1 where vigencia = 'sem_rodada';
  if v_sem_rodada > 0 then
    raise exception '% sinais em sem_rodada logo apos rodar — a rodada nao registrou', v_sem_rodada;
  end if;

  raise notice 'prova: rodada ativa, 192/196 desativados, zero sinais em sem_rodada';
end $prova$;
