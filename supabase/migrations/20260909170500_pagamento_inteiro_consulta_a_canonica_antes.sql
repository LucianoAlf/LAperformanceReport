-- 🔴 A FATURA JÁ PAGA É O CASO NORMAL, NÃO A EXCEÇÃO (09/09/2026, ao vivo).
--
-- 13:44, Recreio. A Vitória mandou o comprovante de R$ 862,00 de 08/09 com a
-- legenda "parcela de setembro alunos / Maria Helena — R$431,00 / João Pedro —
-- R$431,00". A Sol reconheceu a divisão e recusou: *"Entendi a divisão, mas a
-- competência não bate com a fatura"*.
--
-- **A Vitória estava certa.** As parcelas 09/2026 dos dois existem, valem
-- R$ 431,00 no centavo e foram quitadas em **08/09** — a data do comprovante.
-- A `sol_caixa_resolver_pagamento_v1` ia para as de 10/2026 (abertas,
-- R$ 431,20) porque caía direto em `sol_caixa_casar_parcela`, que prefere
-- fatura ABERTA e não tem o ramo `ja_consta_paga`.
--
-- Quem tem é `sol_caixa_parcela_canonica`, com a cascata:
--     ja_consta_paga (valor bate no centavo E pagamento nos últimos 7 dias)
--     → do_mes_a_vencer → aberta_mais_antiga → ultima_da_janela
-- Chamada com os mesmos dados, ela devolve `ja_consta_paga` e a parcela certa
-- nos dois alunos.
--
-- 🔴 A REGRA DE FUNDO, que eu não tinha entendido ao compor: a consultora lança
--    no caixa DEPOIS que o Emusys já baixou a fatura — o sync roda sozinho.
--    Então "fatura paga" é o estado esperado no momento do lançamento, e
--    preferir a aberta manda o dinheiro para a competência seguinte.
--
-- ⚠️ Ordem nova: composto → CANÔNICA → casador simples. O casador continua como
--    último recurso porque resolve o que a canônica não cobre (aluno sem fatura
--    na janela, confirmação manual).
-- ⚠️ Mesma família do conserto de 31/08 (`parcela_canonica` escolhia "a mais
--    atrasada" ignorando o valor): havendo várias faturas plausíveis, o critério
--    é a EVIDÊNCIA do comprovante — valor e data —, nunca a posição na fila.
-- ⚠️ Usa `valor_pago` da fatura, não o valor da parcela: no caso real isso é o
--    que faz a diferença de R$ 0,40 (862,00 × 862,40) desaparecer.
--
-- Verificado nos 4 casos: Vitória (2 alunos, setembro já paga) ok/confere;
-- Mayra (2 alunos, 4+1 cursos) ok/confere; Fernanda (1 aluna, 2 cursos)
-- ok/confere; aluno inexistente recusa.
do $$
declare
  v_def text;
  v_alvo text := '    -- 2) senao, casador SIMPLES (uma fatura) — traz valor em dia e apos vencimento
    v_simples := sol_caixa_casar_parcela(p_unidade_id, v_nome, v_valor, v_comp::text);';
  v_novo text := '    -- 2) CANONICA: e ela que tem o ramo `ja_consta_paga` — fatura quitada no
    --    Emusys cujo valor bate no centavo e cujo pagamento e dos ultimos 7 dias.
    --    Sem esta etapa o pagamento de setembro vira competencia de outubro.
    v_canon := sol_caixa_parcela_canonica(p_unidade_id, v_nome, v_valor, current_date);
    if coalesce((v_canon->>''ok'')::boolean, false) and v_canon->''fatura'' is not null then
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        ''ordem'', v_ordem, ''ok'', true, ''via'', ''canonica'',
        ''motivo_escolha'', v_canon->>''motivo_escolha'',
        ''aluno_nome'', coalesce(v_canon->>''aluno_nome'', v_nome),
        ''responsavel_financeiro'', v_canon->>''responsavel_nome'',
        ''valor'', coalesce((v_canon->''fatura''->>''valor_pago'')::numeric,
                          (v_canon->''fatura''->>''valor_da_parcela'')::numeric, v_valor),
        ''faturas'', jsonb_build_array(v_canon->''fatura'')));
      v_soma := v_soma + coalesce((v_canon->''fatura''->>''valor_pago'')::numeric,
                                  (v_canon->''fatura''->>''valor_da_parcela'')::numeric, v_valor, 0);
      continue;
    end if;

    -- 3) casador SIMPLES como ultimo recurso (aluno sem fatura na janela, etc.)
    v_simples := sol_caixa_casar_parcela(p_unidade_id, v_nome, v_valor, v_comp::text);';
  v_alvo2 text := '  v_composto    jsonb;';
  v_novo2 text := '  v_composto    jsonb;
  v_canon       jsonb;';
  v_n int;
begin
  v_def := pg_get_functiondef('public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_alvo, ''))) / length(v_alvo);
  if v_n <> 1 then raise exception 'ancora do casador apareceu % vezes, esperava 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_alvo2, ''))) / length(v_alvo2);
  if v_n <> 1 then raise exception 'ancora do declare apareceu % vezes, esperava 1', v_n; end if;

  v_def := replace(v_def, v_alvo2, v_novo2);
  v_def := replace(v_def, v_alvo, v_novo);
  execute v_def;
end $$;

revoke execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  from public, anon;
grant execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  to service_role, sol_acesso_restrito;
