-- 🔴 O TEXTO DO SINAL CONGELAVA NA PRIMEIRA DETECÇÃO ENQUANTO O FATO ANDAVA.
--
-- O `on conflict (chave_dedup) do update` só refrescava `visto_em` e
-- `atualizado_em`. `contexto` e `evidencia` — que são DERIVADOS e são o que a
-- consultora lê — ficavam com o valor do dia em que o sinal nasceu.
--
-- Caso real, no bloco do Recreio de 09/09/2026:
--     "Você encerrou a conversa de Arthur em 01/07, mas o motivo não ficou
--      registrado."
-- O `leads.chatwoot_ultima_msg_em` do Arthur é **04/09** — cinco dias antes. O
-- sinal era legítimo e fresco; o TEXTO é que estava 65 dias atrasado. Para quem
-- lê, é indistinguível de arqueologia — e um item que parece de julho ensina a
-- ignorar a lista inteira. Depois do fix, a mesma linha diz "em 04/09".
--
-- 🔴 A LIÇÃO: eu diagnostiquei isto como "sinal velho demais" e escrevi uma
--    janela de idade (migration anterior) antes de conferir o valor VIVO da
--    coluna. O sinal estava certo; o que mentia era a apresentação. **Quando
--    uma data parece absurda, conferir a fonte antes de mudar a regra** — a
--    regra estava certa.
--
-- ⚠️ 1 de 51 sinais hoje, mas com 65 dias de defasagem e caindo justamente no
--    bloco que a Daiana leu. Raro e grave é pior que frequente e leve: o item
--    que quebra a confiança é o que parece absurdo.
-- ⚠️ Refresca SÓ o derivado. `detectado_em` NÃO entra (é quando o sinal nasceu,
--    e é o que a vigência e o "há quanto tempo" usam), e decisão humana
--    (`status`, `triado_por`, `desfecho`) jamais — sobrescrevê-la aqui seria o
--    mesmo erro que o trigger de decisão humana em `aulas_emusys` existe para
--    impedir.
-- ⚠️ Sinal que o detector PAROU de emitir não é refrescado, e é o certo: texto
--    de sinal que sanou não deve ser reescrito.
do $$
declare
  v_def text;
  v_alvo text := 'on conflict (chave_dedup) do update set visto_em = now(), atualizado_em = now()';
  v_novo text := 'on conflict (chave_dedup) do update set visto_em = now(), atualizado_em = now(),'
                 || E'\n      -- derivado acompanha o fato; decisao humana e detectado_em NAO'
                 || E'\n      contexto = excluded.contexto, evidencia = excluded.evidencia';
  v_n int;
begin
  v_def := pg_get_functiondef('public.radar_detectar_sinais_comercial_v1()'::regprocedure);

  -- guarda de ancora: sao as CINCO regras do detector (R15..R20)
  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 5 then
    raise exception 'ancora do on conflict apareceu % vezes, esperava 5 — abortado', v_n;
  end if;

  execute replace(v_def, v_alvo, v_novo);
end $$;

revoke execute on function public.radar_detectar_sinais_comercial_v1() from public, anon;
grant execute on function public.radar_detectar_sinais_comercial_v1() to service_role;

comment on function public.radar_detectar_sinais_comercial_v1() is
  'Detecta R15/R16/R17/R19/R20. O `on conflict` refresca `contexto` e '
  '`evidencia` junto com `visto_em`: sao derivados, e congelados eles fazem a '
  'consultora ler uma data de julho num sinal de setembro.';
