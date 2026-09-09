-- 🔴 O DETECTOR DE CALOR REEMITIA DE HORA EM HORA E NUNCA REGISTRAVA RODADA.
--
-- `radar_detectar_calor_atendimento_v1` roda a cada hora (cron 199, `5 * * * *`)
-- e faz `on conflict do update set visto_em = now()` — ou seja, afirma o sinal
-- de hora em hora. Mas quem grava `radar_rodadas` para o detector
-- `calor_atendimento` era só a rodada diária das 06:00 BRT.
--
-- Efeito na vigencia: ela compara o `visto_em` do sinal com a ULTIMA RODADA do
-- detector daquela regra. Com o carimbo de 10:05 e a rodada de 06:00, o sinal
-- fica `vigente` por construção — inclusive quando o detector JÁ PAROU de
-- emiti-lo. Um R18 de conversa encerrada sobreviveria até a rodada do dia
-- seguinte, ou seja, um dia inteiro de cutucada no privado da consultora.
--
-- Registrar a rodada faz o veredito ficar horário, como a detecção sempre foi.
--
-- ⚠️ A rodada e gravada NO FIM e so quando o corpo terminou: rodada aberta em
--    execucao que falha diria "o detector correu" sem ele ter corrido, e a
--    vigencia passaria a chamar de `sanou` tudo o que ele nao chegou a reemitir.
-- ⚠️ `erros` fica nulo de proposito — a view so considera rodada com `erros is
--    null`, entao uma execucao parcial nao pode passar por boa.
-- ⚠️ A migration SEGUINTE (20260909131656) acrescenta a guarda que faltava aqui:
--    rodada com ZERO avaliados nao pode valer como "o detector correu".
do $$
declare
  v_def text;
  v_alvo text := '  return jsonb_build_object(''ok'', true, ''avaliados'', v_avaliados,';
  v_novo text := '  -- a rodada e o que da a vigencia do R18 (ver comentario da migration)
  insert into radar_rodadas (rodada, detector, concluida_em, resultado)
  values (''diaria'', ''calor_atendimento'', now(),
          jsonb_build_object(''avaliados'', v_avaliados, ''sinais_novos'', v_inseridos,
                             ''sem_identificacao'', v_sem_match, ''origem'', ''detector_horario''));

  return jsonb_build_object(''ok'', true, ''avaliados'', v_avaliados,';
  v_n int;
begin
  v_def := pg_get_functiondef('public.radar_detectar_calor_atendimento_v1(integer)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 1 then
    raise exception 'ancora do return apareceu % vezes, esperava 1 — abortado', v_n;
  end if;

  execute replace(v_def, v_alvo, v_novo);
end $$;

revoke execute on function public.radar_detectar_calor_atendimento_v1(integer) from public, anon;
grant execute on function public.radar_detectar_calor_atendimento_v1(integer) to service_role;
