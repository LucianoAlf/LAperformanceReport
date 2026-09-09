-- 🔴 SINAL RECEM-NASCIDO ERA DECLARADO "SANOU" (medido 09/09/2026: 18 de 33).
--
-- `visto_em` nasce NULL: o `ON CONFLICT DO UPDATE SET visto_em` so dispara na
-- SEGUNDA deteccao, e `radar_marcar_foto_conversas_v1` roda ANTES do insert dos
-- sinais novos. Como `NULL >= x` e NULL, a linha caia no `ELSE 'sanou'`.
--
-- Efeito: o sinal mais fresco — o unico sobre o qual ainda da tempo de agir —
-- ficava invisivel no dia em que nasceu e so aparecia no dia seguinte.
-- Medido: `vigente` com `visto_em` nulo = ZERO linhas. O NULL sempre produzia
-- 'sanou', de forma deterministica.
--
-- A correcao e semantica, nao cosmetica: "o detector afirmou isto na ultima
-- rodada" vale tanto por INSERT (`detectado_em`) quanto por remarcacao
-- (`visto_em`) — sao os dois jeitos de o detector dizer a mesma coisa.
--
-- Prova: das 33 linhas que a view chamava de `sanou`, 14 ainda estavam
-- legitimamente pendentes no Chatwoot ao vivo. Depois deste conserto: 17
-- `sanou`, TODAS conferidas como ja atendidas. Zero remocao indevida.
--
-- ⚠️ Este conserto e PRE-REQUISITO de fazer a pauta ler a view. Aplicado
--    sozinho, o consumidor lendo `radar_sinais` cru nao muda de comportamento.
do $$
declare
  v_def text;
  v_alvo text := 'WHEN s.visto_em >= (ro.em - ''00:30:00''::interval) THEN ''vigente''::text';
  v_novo text := 'WHEN GREATEST(s.visto_em, s.detectado_em) >= (ro.em - ''00:30:00''::interval) THEN ''vigente''::text';
  v_n int;
begin
  v_def := pg_get_viewdef('public.vw_radar_sinal_vigencia_v1'::regclass, true);

  -- guarda de ancora: declarar o numero esperado, nunca supor 1
  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 1 then
    raise exception 'ancora da vigencia apareceu % vezes, esperava 1 — abortado', v_n;
  end if;

  execute 'create or replace view public.vw_radar_sinal_vigencia_v1 as '
          || replace(v_def, v_alvo, v_novo);
end $$;

comment on view public.vw_radar_sinal_vigencia_v1 is
  'Vigencia do sinal: `vigente` = o detector DAQUELA regra o afirmou na ultima '
  'rodada boa (por insert ou por remarcacao — dai o GREATEST com detectado_em, '
  'sem o qual sinal recem-nascido virava `sanou`); `sanou` = a rodada correu e '
  'ele parou de ser afirmado; `sem_rodada` = detector atrasado, e ALARME, nunca '
  'lista vazia. Leia SEMPRE daqui para montar pauta — nunca de radar_sinais cru.';
