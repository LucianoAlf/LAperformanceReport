-- 🔴 O NÚCLEO DO PAGAMENTO INTEIRO DEVOLVIA `ok:true` COM R$ 923 A MENOS
--    (medido em produção, 09/09/2026, leitura pura).
--
-- Rodei o caso real da Mayra contra `sol_caixa_resolver_pagamento_v1`:
--
--     entrada : [{"aluno_nome":"Davi","valor":1290}]
--     saída   : ok=TRUE, via=canonica, 1 fatura — "Parcela 09/2026 de Teclado",
--               R$ 367,00. soma_resolvida=367, soma_confere=false, diferença=923.
--
-- Três defeitos encadeados, e o terceiro é o que faz dinheiro sair errado:
--
--   1. `sol_caixa_resolver_composto_aluno_v1` respondeu `aluno_ambiguo` — há
--      **10 alunos chamados "Davi" em Campo Grande** — e a cascata tratou essa
--      RECUSA como "não é um caso composto", descendo para o ramo seguinte.
--      Com o nome cheio a composta acerta os 4 cursos e fecha 1.290 no centavo.
--      Ou seja: a ferramenta certa existe e funciona; quem a atropela é a ordem.
--
--   2. O ramo seguinte então ESCOLHEU uma fatura qualquer do aluno sorteado,
--      ignorando que o humano havia declarado R$ 1.290. O valor declarado não
--      era contrato para o ramo — era sugestão.
--
--   3. O topo somou "todos os itens resolveram" e disse `ok:true`. A divergência
--      ficou em `soma_confere`, um campo ao lado — e campo ao lado é campo que
--      ninguém lê. Foi assim que a Sol escreveu "soma confere" com R$ 1.290 de
--      um comprovante de R$ 1.722 em 09/09.
--
-- ⚠️ Mesma lição de 29/08 (`word_similarity`): **ambiguidade é recusa, nunca
--    sorteio**. Ali a correção foi na raiz (`sol_nome_mesma_pessoa_v1`) e as
--    guardas dos consumidores ficaram como segunda linha; aqui o consumidor
--    estava jogando fora a recusa que a raiz já emitia.
--
-- ⚠️ A conferência do valor declarado é feita sobre a SAÍDA, item a item, e não
--    repetida dentro dos três ramos. Assim ramo novo nasce coberto — repetir a
--    condição em cada ramo é a causa-raiz das duplicatas de renovação.
--
-- 🔴 E ELA COMPARA CONTRA A FATURA, NUNCA CONTRA O CAMPO `valor` DO ITEM. Os
--    ramos fazem `coalesce(valor_pago, valor_da_parcela, v_valor)`: quando não
--    conseguem ler o valor da fatura, ECOAM o valor declarado. Comparar o
--    declarado com esse eco é comparar o número com ele mesmo — a conferência
--    passava sempre. Medido no ensaio isolado: pedindo R$ 1.277,77 para quem
--    tem uma fatura de R$ 500,00, a função devolvia `ok:true`. Agora o valor
--    resolvido é somado das FATURAS devolvidas; se não há fatura, a soma é zero
--    e a divergência aparece.
--
-- ⚠️ Não muda o que a função SABE fazer: composta, canônica e casador continuam
--    intactos e na mesma ordem. Muda quando ela tem o direito de dizer "sim".

do $mig$
declare
  v_def text;
  v_n   int;

  -- ÂNCORA 1 — fim do ramo composto (conferido no texto vivo: 1 ocorrência)
  v_a1 text := '      v_soma := v_soma + coalesce((v_composto->>''soma_itens'')::numeric, v_valor, 0);
      continue;
    end if;';

  v_n1 text := '      v_soma := v_soma + coalesce((v_composto->>''soma_itens'')::numeric, v_valor, 0);
      continue;
    end if;

    -- 1b) AMBIGUIDADE E RECUSA, NUNCA DESCIDA DE CASCATA (09/09/2026).
    --     A composta ja aplicou `sol_nome_mesma_pessoa_v1`; se ela diz que o
    --     primeiro nome serve para varias pessoas, o ramo seguinte nao tem
    --     informacao NOVA nenhuma — ele so tem menos escrupulo. Descer aqui era
    --     transformar "nao sei quem e" em "escolhi um".
    if coalesce(v_composto->>''motivo'', '''') in (''aluno_ambiguo'', ''ambiguo'') then
      v_ok_todos := false;
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        ''ordem'', v_ordem, ''ok'', false, ''aluno_nome'', v_nome,
        ''valor_declarado'', v_valor, ''motivo'', ''nome_ambiguo'',
        ''candidatos'', v_composto->''candidatos''));
      continue;
    end if;';

  -- ÂNCORA 2 — cabeçalho do return (conferido no texto vivo: 1 ocorrência)
  v_a2 text := '  return jsonb_build_object(
    ''ok'', v_ok_todos,';

  v_n2 text := '  -- 🔴 O VALOR DECLARADO PELO HUMANO E CONTRATO, NAO SUGESTAO (09/09/2026).
  --    Conferido sobre a SAIDA, uma vez, em vez de repetido nos tres ramos.
  select coalesce(jsonb_agg(y order by (y->>''ordem'')::int), ''[]''::jsonb)
    into v_resolvidos
    from (
      select case
        when coalesce((x->>''ok'')::boolean, false)
             and nullif(p_itens->(((x->>''ordem'')::int) - 1)->>''valor'', '''') is not null
             and abs(coalesce((select sum(coalesce(
                     nullif(f->>''valor'','''')::numeric,
                     nullif(coalesce(f->''fatura'', f)->>''valor_pago'','''')::numeric,
                     nullif(coalesce(f->''fatura'', f)->>''valor_hoje'','''')::numeric,
                     nullif(coalesce(f->''fatura'', f)->>''valor_da_parcela'','''')::numeric, 0))
                   from jsonb_array_elements(coalesce(x->''faturas'', ''[]''::jsonb)) f), 0)
                     - (p_itens->(((x->>''ordem'')::int) - 1)->>''valor'')::numeric) > 0.01
        then x || jsonb_build_object(
               ''ok'', false, ''motivo'', ''valor_declarado_nao_bate'',
               ''valor_declarado'', (p_itens->(((x->>''ordem'')::int) - 1)->>''valor'')::numeric,
               ''valor_encontrado'', coalesce((select sum(coalesce(
                     nullif(f->>''valor'','''')::numeric,
                     nullif(coalesce(f->''fatura'', f)->>''valor_pago'','''')::numeric,
                     nullif(coalesce(f->''fatura'', f)->>''valor_hoje'','''')::numeric,
                     nullif(coalesce(f->''fatura'', f)->>''valor_da_parcela'','''')::numeric, 0))
                   from jsonb_array_elements(coalesce(x->''faturas'', ''[]''::jsonb)) f), 0))
        else x end as y
      from jsonb_array_elements(v_resolvidos) x) z;

  select coalesce(bool_and(coalesce((y->>''ok'')::boolean, false)), true),
         coalesce(sum(case when coalesce((y->>''ok'')::boolean, false)
                           then (y->>''valor'')::numeric else 0 end), 0)
    into v_ok_todos, v_soma
    from jsonb_array_elements(v_resolvidos) y;

  return jsonb_build_object(
    -- 🔴 `ok` NAO PODE SER VERDADE COM A SOMA ERRADA. Quem consome le UM campo;
    --    deixar a divergencia so em `soma_confere` e apostar que alguem lembra.
    ''ok'', v_ok_todos and (p_valor_total is null
                          or abs(v_soma - p_valor_total) < 0.01),
    ''itens_ok'', v_ok_todos,';
begin
  v_def := pg_get_functiondef(
    'public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
  if v_n <> 1 then raise exception 'ancora do composto apareceu % vezes, esperava 1', v_n; end if;
  v_n := (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2);
  if v_n <> 1 then raise exception 'ancora do return apareceu % vezes, esperava 1', v_n; end if;

  v_def := replace(v_def, v_a1, v_n1);
  v_def := replace(v_def, v_a2, v_n2);
  execute v_def;
end $mig$;

-- 🔴 TETO DE TEMPO MEDIDO, NÃO ESTIMADO (09/09/2026, `explain analyze`):
--      2 alunos ......  4.086 ms
--      4 alunos ...... 10.024 ms
--    Cada ramo reconstrói `sol_faturas_alunos_v1` (envelope de faturas da
--    unidade inteira, ~1,25 s), e um aluno percorre até 3 ramos. O papel
--    `authenticator` impõe `statement_timeout` de 8 s a TODO acesso por
--    PostgREST — inclusive `service_role` —, então a partir de 3 alunos em
--    cascata a chamada morre com 57014 ANTES de responder.
--    Uso real até hoje: 13 lotes de 2 itens e 1 de 3 — ou seja, o teto morde
--    exatamente na borda do que a equipe já faz.
-- ⚠️ Por FUNÇÃO, nunca no papel: o 8 s global é guard-rail, não defeito. Mesmo
--    remédio de `publish_financeiro_sync_run` (incidente de 28/08).
-- ⚠️ Isto compra tempo, não resolve. O envelope repetido é trabalho duplicado —
--    a mesma assinatura de `get_kpis_alunos_canonicos` — e merece frente
--    própria: transformar composta/canônica/casador em casca fina sobre uma
--    variante que RECEBE o envelope. Não cabe na mesma rodada que mexe em
--    dinheiro.
alter function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  set statement_timeout = '60s';

revoke execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date) is
  'Resolve um pagamento INTEIRO: N alunos, cada um com N faturas. Compoe '
  'composto+canonica+casador, nunca reimplementa regra. `ok` so e verdadeiro '
  'quando TODOS os itens resolveram E a soma bate com o comprovante. '
  'Ambiguidade de nome e recusa terminal, nunca sorteio (09/09/2026). Valor '
  'declarado pelo humano e contrato: fatura de outro valor devolve '
  'valor_declarado_nao_bate. Nao aprova dinheiro.';

-- ROLLBACK: reaplicar 20260909163318 e depois 20260909170500, nesta ordem,
--           e `alter function ... reset statement_timeout`.
