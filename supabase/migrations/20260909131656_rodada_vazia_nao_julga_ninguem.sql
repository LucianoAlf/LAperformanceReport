-- 🔴 RODADA COM ZERO AVALIADOS NAO PODE VALER COMO "O DETECTOR CORREU".
--
-- A migration anterior (20260909131552) passou a registrar a rodada do detector
-- de calor — necessário, porque sem ela a vigencia comparava o carimbo horario
-- com a rodada diaria. Só que ela gravava a rodada SEMPRE, e o detector lê uma
-- tabela de staging alimentada pela edge: chamado fora do ciclo da edge, ele
-- avalia ZERO e mesmo assim declarava rodada.
--
-- Efeito: uma rodada vazia faz a vigencia entender "o detector rodou e parou de
-- emitir" — ou seja, `sanou` para TODOS os R18 de uma vez. Peguei na primeira
-- execução de teste (`avaliados: 0` e rodada gravada); só não virou dano porque
-- a tolerância de 30 min da view cobriu o carimbo anterior, o que é sorte de
-- relógio, não garantia.
--
-- É o mesmo princípio que `radar_marcar_foto_conversas_v1` já aplica com
-- `p_truncado`: **ausência não prova resposta**. Foto vazia não decide nada.
do $$
declare
  v_def     text;
  v_alvo    text := '  insert into radar_rodadas (rodada, detector, concluida_em, resultado)';
  v_novo    text := '  -- 🔴 rodada VAZIA nao julga: sem nada avaliado, "nao reemitiu" nao significa
  --    "sanou" — significa que o detector nao viu nada. Mesmo principio do
  --    `p_truncado` da foto de conversa: ausencia nao prova resposta.
  if v_avaliados > 0 then
  insert into radar_rodadas (rodada, detector, concluida_em, resultado)';
  v_fim_alvo text := '''detector_horario''));

  return jsonb_build_object';
  v_fim_novo text := '''detector_horario''));
  end if;

  return jsonb_build_object';
  v_n int;
begin
  v_def := pg_get_functiondef('public.radar_detectar_calor_atendimento_v1(integer)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 1 then raise exception 'ancora do insert apareceu % vezes, esperava 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_fim_alvo, ''))) / length(v_fim_alvo);
  if v_n <> 1 then raise exception 'ancora do fim apareceu % vezes, esperava 1', v_n; end if;

  v_def := replace(v_def, v_alvo, v_novo);
  v_def := replace(v_def, v_fim_alvo, v_fim_novo);
  execute v_def;
end $$;

-- a rodada vazia que a execucao de teste gravou nao pode ficar valendo
delete from radar_rodadas
 where detector = 'calor_atendimento'
   and coalesce((resultado->>'avaliados')::int, 0) = 0
   and concluida_em > now() - interval '2 hours';

revoke execute on function public.radar_detectar_calor_atendimento_v1(integer) from public, anon;
grant execute on function public.radar_detectar_calor_atendimento_v1(integer) to service_role;

comment on function public.radar_detectar_calor_atendimento_v1(integer) is
  'Detecta R18 (cliente preso no bot) de hora em hora e registra a rodada — mas '
  'SO quando avaliou alguma coisa: rodada vazia faria a vigencia declarar `sanou` '
  'para todos os R18 de uma vez.';
