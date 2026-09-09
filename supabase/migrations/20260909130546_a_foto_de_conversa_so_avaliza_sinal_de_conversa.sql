-- 🔴 A FOTO DE CONVERSA ESTAVA AVALIZANDO SINAL DE OUTRO DETECTOR.
--
-- `radar_marcar_foto_conversas_v1` marca `visto_em` em TODO sinal aberto com
-- aquele `conversa_id` — sem olhar de qual detector a regra é. Medido em
-- 09/09/2026: **5 dos 8 sinais R18 abertos** (detector `calor_atendimento`)
-- levaram carimbo da rodada de CONVERSA.
--
-- O estrago é na vigencia: ela compara o `visto_em` do sinal com a rodada do
-- detector DAQUELA regra. Um carimbo dado às 09:25 pela rodada de conversa,
-- comparado com a rodada de calor das 06:00, dá `vigente` — ou seja, uma
-- rodada afirma o que ela não tem como saber.
--
-- ⚠️ A restrição é pelo MAPA DERIVADO (`radar_regras.detector`, mantido por
--    `radar_sincronizar_detectores_v1` a partir do corpo das funções), nunca
--    por lista à mão: lista escrita pega regra não classificada, jamais regra
--    mal classificada.
-- ⚠️ Vale para as DUAS pernas, inclusive a de "fora da foto por idade": manter
--    vivo por idade também é uma afirmação, e a rodada de conversa não pode
--    fazê-la sobre um sinal de calor ou de anamnese.
do $$
declare
  v_def text;
  v_alvo text := 'where s.status in (''aberto'',''triado'')
    and s.evidencia ? ''conversa_id''';
  v_novo text := 'where s.status in (''aberto'',''triado'')
    -- 🔴 so sinal DESTE detector: uma rodada nao avaliza o que nao mediu
    and exists (select 1 from radar_regras rr
                 where rr.codigo = s.regra_codigo and rr.detector = ''conversa'')
    and s.evidencia ? ''conversa_id''';
  v_n int;
begin
  v_def := pg_get_functiondef(
    'public.radar_marcar_foto_conversas_v1(integer[],boolean,integer)'::regprocedure);

  -- guarda de ancora: sao DUAS pernas (presenca na foto e idade inconclusiva)
  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 2 then
    raise exception 'ancora apareceu % vezes, esperava 2 — abortado', v_n;
  end if;

  execute replace(v_def, v_alvo, v_novo);
end $$;

revoke execute on function public.radar_marcar_foto_conversas_v1(integer[],boolean,integer)
  from public, anon;
grant execute on function public.radar_marcar_foto_conversas_v1(integer[],boolean,integer)
  to service_role;

comment on function public.radar_marcar_foto_conversas_v1(integer[], boolean, integer) is
  'Segunda foto do detector de CONVERSA: diz quais sinais dele continuam vivos. '
  'So carimba regra cujo `radar_regras.detector` e `conversa` — carimbar sinal '
  'de outro detector faz a vigencia dele mentir (5 de 8 R18 em 09/09/2026).';
