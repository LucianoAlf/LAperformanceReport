-- Ensaio do pagamento inteiro (N alunos × N faturas) contra dados REAIS.
-- Leitura pura: nenhuma linha é escrita, nenhum caixa é tocado.
--
--   psql "$SOL_DB_URL" -v ON_ERROR_STOP=1 -f tests/sol-caixa/ensaio-pagamento-inteiro.sql
--
-- 🔴 COMO ISTO FOI VERIFICADO ANTES DE EXISTIR (09/09/2026). As duas migrations
--    ainda não podiam ser aplicadas (produção estava sob gate), então recriei as
--    funções corrigidas dentro de `pg_temp` — schema de sessão, invisível para
--    todo mundo, descartado ao desconectar — e rodei estes mesmos casos contra
--    os dados de produção. Foi assim que o defeito apareceu: com a função como
--    estava no ar, `[{"aluno_nome":"Davi","valor":1290}]` devolvia **ok=TRUE**
--    resolvendo UMA fatura de R$ 367,00 (`soma_confere:false`, diferença 923).
--
-- ⚠️ Este arquivo NÃO recopia o corpo das funções. Guardar uma terceira versão
--    da regra para "poder testar" seria a mesma doença que ele testa. Aqui só
--    moram as PERGUNTAS; as respostas vêm das funções vivas.
--
-- ⚠️ Depende de dados reais de Campo Grande (a família Souza Chaves Ribeiro,
--    setembro/2026). Se as faturas mudarem de competência, os casos 2 e 3
--    passam a pular sozinhos em vez de mentir — ver o `case when` de cada um.

\set ON_ERROR_STOP on
set statement_timeout = '120s';

\echo '=== ENSAIO: pagamento inteiro (N alunos x N faturas) ==='

with u as (
  select id from unidades where nome ilike '%campo grande%' limit 1
),
-- CASO 1 — ambiguidade é RECUSA, nunca sorteio.
--   Há 10 alunos "Davi" em CG. Antes desta correção a cascata tratava a recusa
--   da composta como "não é composto" e descia um ramo, que escolhia um deles.
c1 as (
  select sol_caixa_resolver_pagamento_v1((select id from u),
    '[{"aluno_nome":"Davi","valor":1290}]'::jsonb, 1290, null) as j
),
-- CASO 2 — o caso da Mayra: 2 alunos, 5 faturas, R$ 1.722,00.
c2 as (
  select sol_caixa_resolver_pagamento_itens_v1((select id from u),
    '[{"aluno_nome":"Davi Guilherme De Souza Chaves Ribeiro","valor":1290},
      {"aluno_nome":"Thuanny","valor":432}]'::jsonb, 1722, null) as j
),
-- CASO 3 — valor declarado é contrato: fatura de outro valor não serve.
c3 as (
  select sol_caixa_resolver_pagamento_v1((select id from u),
    '[{"aluno_nome":"Thuanny","valor":999}]'::jsonb, 999, null) as j
),
-- CASO 4 — soma que não fecha derruba o lote inteiro (atomicidade).
c4 as (
  select sol_caixa_resolver_pagamento_itens_v1((select id from u),
    '[{"aluno_nome":"Davi Guilherme De Souza Chaves Ribeiro","valor":1290},
      {"aluno_nome":"Thuanny","valor":432}]'::jsonb, 9999, null) as j
)
select v.caso, v.esperado, v.obtido,
       case when v.esperado = v.obtido then 'ok' else '*** FALHOU ***' end as veredito
from (
  values
    ('1 ambiguidade recusa',
     'false/nome_ambiguo',
     (select (j->>'ok') || '/' || coalesce(j->'alunos'->0->>'motivo','?') from c1)),

    ('2 Mayra: ok',
     'true',
     (select j->>'ok' from c2)),

    ('2 Mayra: linhas no lote',
     '5',
     (select jsonb_array_length(j->'itens')::text from c2)),

    ('2 Mayra: faturas distintas',
     '5',
     (select count(distinct x->>'canonical_fatura_id')::text
        from c2, jsonb_array_elements(j->'itens') x)),

    ('2 Mayra: soma',
     '1722.00',
     (select j->>'soma_itens' from c2)),

    ('2 Mayra: toda linha leva status da fatura',
     '0',
     (select count(*)::text from c2, jsonb_array_elements(j->'itens') x
       where x->'fatura'->>'status' is null)),

    ('2 Mayra: competencia normalizada MM/YYYY',
     '0',
     (select count(*)::text from c2, jsonb_array_elements(j->'itens') x
       where x->>'competencia' !~ '^[0-9]{2}/[0-9]{4}$')),

    ('3 valor declarado e contrato',
     'false/valor_declarado_nao_bate',
     (select (j->>'ok') || '/' || coalesce(j->'alunos'->0->>'motivo','?') from c3)),

    ('4 atomicidade: soma nao fecha',
     'false/soma_itens_divergente',
     (select (j->>'ok') || '/' || coalesce(j->>'motivo','?') from c4))
) as v(caso, esperado, obtido)
order by v.caso;

-- Teto de tempo, para não descobrir isso de novo em produção. O `authenticator`
-- do PostgREST impõe 8 s a todo acesso — inclusive `service_role` —, e cada ramo
-- reconstrói o envelope de faturas da unidade (~1,25 s por construção).
\echo '=== custo (o 57014 mora aqui) ==='
explain (analyze, costs off, timing off)
select sol_caixa_resolver_pagamento_itens_v1(
  (select id from unidades where nome ilike '%campo grande%' limit 1),
  '[{"aluno_nome":"Davi Guilherme De Souza Chaves Ribeiro","valor":1290},
    {"aluno_nome":"Thuanny","valor":432}]'::jsonb, 1722, null);
