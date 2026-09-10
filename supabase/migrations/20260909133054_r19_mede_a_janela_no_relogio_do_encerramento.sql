-- R19 usava DOIS RELÓGIOS: a janela num, a pergunta no outro.
--
-- A regra filtra `dias_parado > 2 and <= 30`, e `dias_parado` vem da jornada —
-- mede dias desde a última atividade do lead no CRM. Mas o que ela PERGUNTA é
-- sobre o encerramento da conversa, cuja data é `chatwoot_ultima_msg_em`. Nada
-- garantia que os dois estivessem na mesma janela.
--
-- ⚠️ CORREÇÃO DE REGISTRO: escrevi esta migration achando que ela consertava o
--    caso Arthur ("Você encerrou a conversa de Arthur em 01/07", no bloco do
--    Recreio de 09/09). **Não era isso.** O `chatwoot_ultima_msg_em` dele é
--    04/09 — o sinal estava certo e fresco; quem estava 65 dias atrasado era o
--    TEXTO, congelado na primeira detecção. Esse é o defeito real e está na
--    migration seguinte (20260909133222).
--
-- A guarda fica mesmo assim, porque a assimetria de relógios é verdadeira e
-- perguntar em setembro por um encerramento de julho não é trabalho — só não
-- era o que estava acontecendo aqui. Efeito medido hoje: zero linhas a menos
-- (os dois relógios concordam em 33 de 33).
--
-- ⚠️ É uma SEGUNDA condição, não substitui a do CRM: as duas medem coisas
--    diferentes e as duas importam.
-- ⚠️ Encerramento sem data (`null`) continua passando — ausência de data não é
--    prova de que é antigo, e barrar por ela sumiria com caso legítimo.
do $$
declare
  v_def text;
  v_alvo text := '      and j.dias_parado > 2 and j.dias_parado <= 30
      and j.entrou_em >= v_hoje - 120
      and public.fn_lead_estado_pauta_v1(j.lead_id) = ''pedir_motivo''';
  v_novo text := '      and j.dias_parado > 2 and j.dias_parado <= 30
      -- 🔴 a janela TAMBEM no relogio do encerramento: e sobre ele que a
      --    pergunta e feita
      and (l.chatwoot_ultima_msg_em is null
           or l.chatwoot_ultima_msg_em >= v_hoje - 30)
      and j.entrou_em >= v_hoje - 120
      and public.fn_lead_estado_pauta_v1(j.lead_id) = ''pedir_motivo''';
  v_n int;
begin
  v_def := pg_get_functiondef('public.radar_detectar_sinais_comercial_v1()'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 1 then
    raise exception 'ancora do R19 apareceu % vezes, esperava 1 — abortado', v_n;
  end if;

  execute replace(v_def, v_alvo, v_novo);
end $$;

revoke execute on function public.radar_detectar_sinais_comercial_v1() from public, anon;
grant execute on function public.radar_detectar_sinais_comercial_v1() to service_role;
