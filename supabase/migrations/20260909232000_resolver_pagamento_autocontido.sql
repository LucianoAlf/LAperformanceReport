-- ⛔ NÃO APLICADA EM PRODUÇÃO. Definição FINAL e AUTOCONTIDA do resolver.
--
-- 🔴 POR QUE ESTA MIGRATION SUBSTITUI A 20260909193000. Aquela era patch-style
--    (`pg_get_functiondef` + `replace` + `execute`) e NÃO APLICAVA em replay
--    limpo: `ancora do composto apareceu 0 vezes`. A causa era o `\r` do CRLF
--    no meio da âncora multilinha — mas a causa exata é o menos importante.
--    O ponto é que patch depende do estado em que encontra a função, e num
--    banco reconstruído do zero esse estado é outro.
--
--    Consequência medida, e é dinheiro: sem esta migration a regra financeira
--    simplesmente não existia. Pedindo R$ 1.277,77 para um aluno com uma fatura
--    de R$ 500,00, a função devolvia `ok:true` com `diferenca: 777.77` — nem a
--    conferência do valor declarado nem o `ok` que exige a soma estavam lá.
--    O ensaio isolado pegou isso na verificação 7; o CI, não, porque só olhava
--    o runtime JS.
--
-- O QUE ELA GARANTE, e cada uma nasceu de um caso real de 09/09:
--   · AMBIGUIDADE É RECUSA, nunca sorteio. Há 10 alunos "Davi" em Campo Grande;
--     a composta recusa com `aluno_ambiguo` e a cascata tratava isso como "não
--     é composto", descendo para um ramo que escolhia um deles.
--   · O VALOR DECLARADO É CONTRATO — e a conferência compara contra a FATURA,
--     nunca contra o campo `valor` do item: os ramos fazem
--     `coalesce(valor_pago, ..., v_valor)` e ECOAM o declarado quando não leem
--     a fatura. Comparar o declarado com esse eco é comparar o número com ele
--     mesmo.
--   · `ok` SÓ É VERDADE COM A SOMA CERTA. Quem consome lê UM campo; deixar a
--     divergência só em `soma_confere` é apostar que alguém lembra de olhar.
--     Foi assim que a Sol escreveu "soma confere" com R$ 1.290 de um
--     comprovante de R$ 1.722.
--   · UM envelope por chamada, não dois por aluno (ver 20260909210000).
--   · Data de negócio em BRT: `current_date` é UTC e vira o dia seguinte às 21h.
--
-- ⚠️ IDEMPOTENTE e sem dependência de estado: `create or replace` puro. Rodar
--    duas vezes, ou num banco vazio, dá o mesmo resultado.

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION public.sol_caixa_resolver_pagamento_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_competencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_item        jsonb;
  v_nome        text;
  v_valor       numeric;
  v_comp        date := coalesce(p_competencia, date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date);
  v_composto    jsonb;
  -- 🔴 UM envelope para a chamada inteira (09/09/2026). Antes: 2 por aluno.
  v_envelope    jsonb;
  -- data de NEGOCIO e BRT. `current_date` e UTC e vira o dia seguinte as 21h.
  v_as_of_brt   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_canon       jsonb;
  v_simples     jsonb;
  v_resp        text;
  v_faturas     jsonb;
  v_resolvidos  jsonb := '[]'::jsonb;
  v_soma        numeric := 0;
  v_ordem       int := 0;
  v_ok_todos    boolean := true;
begin
  if p_unidade_id is null or p_itens is null or jsonb_typeof(p_itens) <> 'array'
     or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'itens_ausentes');
  end if;

  -- Monta o envelope UMA vez, antes do laco. As duas funcoes de regra pedem
  -- exatamente este (conferido no texto vivo delas), entao compartilhar nao
  -- muda o que nenhuma enxerga — so para de refazer o mesmo trabalho N vezes.
  v_envelope := public.sol_faturas_alunos_v1(
    p_unidade_id, extract(year from v_as_of_brt)::int, extract(month from v_as_of_brt)::int,
    'janela_3', 'todas', v_as_of_brt);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_nome  := nullif(btrim(v_item->>'aluno_nome'), '');
    v_valor := nullif(v_item->>'valor', '')::numeric;

    if v_nome is null then
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem, 'ok', false, 'motivo', 'aluno_sem_nome'));
      v_ok_todos := false;
      continue;
    end if;

    -- 1) tenta o COMPOSTO (aluno com 2+ faturas no mes)
    v_composto := sol_caixa_resolver_composto_aluno_env_v1(v_envelope, jsonb_build_object(
      'unidade_id', p_unidade_id, 'aluno_nome', v_nome,
      'competencia', v_comp, 'valor_total', v_valor));

    if coalesce((v_composto->>'ok')::boolean, false)
       and jsonb_array_length(coalesce(v_composto->'itens','[]'::jsonb)) >= 2 then
      v_faturas := v_composto->'itens';
      v_resp := coalesce(v_composto->>'responsavel_financeiro',
                         v_composto->'itens'->0->>'responsavel_financeiro');
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem, 'ok', true, 'via', 'composto',
        'aluno_nome', coalesce(v_composto->>'aluno_nome', v_nome),
        'responsavel_financeiro', v_resp,
        'valor', coalesce((v_composto->>'soma_itens')::numeric, v_valor),
        'faturas', v_faturas));
      v_soma := v_soma + coalesce((v_composto->>'soma_itens')::numeric, v_valor, 0);
      continue;
    end if;

    if coalesce(v_composto->>'motivo', '') in ('aluno_ambiguo', 'ambiguo') then
      v_ok_todos := false;
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem, 'ok', false, 'aluno_nome', v_nome,
        'valor_declarado', v_valor, 'motivo', 'nome_ambiguo',
        'candidatos', v_composto->'candidatos'));
      continue;
    end if;

    -- 2) CANONICA: e ela que tem o ramo `ja_consta_paga` — fatura quitada no
    --    Emusys cujo valor bate no centavo e cujo pagamento e dos ultimos 7 dias.
    --    Sem esta etapa o pagamento de setembro vira competencia de outubro.
    v_canon := sol_caixa_parcela_canonica_env_v1(v_envelope, p_unidade_id, v_nome, v_valor, v_as_of_brt);
    if coalesce((v_canon->>'ok')::boolean, false) and v_canon->'fatura' is not null then
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem, 'ok', true, 'via', 'canonica',
        'motivo_escolha', v_canon->>'motivo_escolha',
        'aluno_nome', coalesce(v_canon->>'aluno_nome', v_nome),
        'responsavel_financeiro', v_canon->>'responsavel_nome',
        'valor', coalesce((v_canon->'fatura'->>'valor_pago')::numeric,
                          (v_canon->'fatura'->>'valor_da_parcela')::numeric, v_valor),
        'faturas', jsonb_build_array(v_canon->'fatura')));
      v_soma := v_soma + coalesce((v_canon->'fatura'->>'valor_pago')::numeric,
                                  (v_canon->'fatura'->>'valor_da_parcela')::numeric, v_valor, 0);
      continue;
    end if;

    -- 3) casador SIMPLES como ultimo recurso (aluno sem fatura na janela, etc.)
    v_simples := sol_caixa_casar_parcela(p_unidade_id, v_nome, v_valor, v_comp::text);

    if coalesce((v_simples->>'ok')::boolean, false)
       and not coalesce((v_simples->>'ambiguo')::boolean, false) then
      -- ⚠️ a RPC devolve envelope jsonb; o card precisa do NOME
      v_resp := sol_caixa_responsavel_aluno(p_unidade_id,
                  coalesce(v_simples->>'aluno_nome', v_nome))->>'responsavel_nome';
      v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem, 'ok', true, 'via', 'parcela',
        'aluno_nome', coalesce(v_simples->>'aluno_nome', v_nome),
        'responsavel_financeiro', v_resp,
        'valor', coalesce((v_simples->'parcela'->>'valor')::numeric, v_valor),
        'faturas', jsonb_build_array(v_simples->'parcela')));
      v_soma := v_soma + coalesce((v_simples->'parcela'->>'valor')::numeric, v_valor, 0);
      continue;
    end if;

    -- 3) nao resolveu: diz QUEM e POR QUE, sem derrubar os outros
    v_ok_todos := false;
    v_resolvidos := v_resolvidos || jsonb_build_array(jsonb_build_object(
      'ordem', v_ordem, 'ok', false, 'aluno_nome', v_nome,
      'valor_declarado', v_valor,
      'motivo', case
        when coalesce((v_simples->>'ambiguo')::boolean, false) then 'nome_ambiguo'
        else coalesce(v_simples->>'motivo', 'sem_fatura_que_bata') end,
      'candidatos', v_simples->'candidatos'));
  end loop;

  select coalesce(jsonb_agg(y order by (y->>'ordem')::int), '[]'::jsonb)
    into v_resolvidos
    from (
      select case
        when coalesce((x->>'ok')::boolean, false)
             and nullif(p_itens->(((x->>'ordem')::int) - 1)->>'valor', '') is not null
             and abs(coalesce((select sum(coalesce(
                     nullif(f->>'valor','')::numeric,
                     nullif(coalesce(f->'fatura', f)->>'valor_pago','')::numeric,
                     nullif(coalesce(f->'fatura', f)->>'valor_hoje','')::numeric,
                     nullif(coalesce(f->'fatura', f)->>'valor_da_parcela','')::numeric, 0))
                   from jsonb_array_elements(coalesce(x->'faturas', '[]'::jsonb)) f), 0)
                     - (p_itens->(((x->>'ordem')::int) - 1)->>'valor')::numeric) > 0.01
        then x || jsonb_build_object(
               'ok', false, 'motivo', 'valor_declarado_nao_bate',
               'valor_declarado', (p_itens->(((x->>'ordem')::int) - 1)->>'valor')::numeric,
               'valor_encontrado', coalesce((select sum(coalesce(
                     nullif(f->>'valor','')::numeric,
                     nullif(coalesce(f->'fatura', f)->>'valor_pago','')::numeric,
                     nullif(coalesce(f->'fatura', f)->>'valor_hoje','')::numeric,
                     nullif(coalesce(f->'fatura', f)->>'valor_da_parcela','')::numeric, 0))
                   from jsonb_array_elements(coalesce(x->'faturas', '[]'::jsonb)) f), 0))
        else x end as y
      from jsonb_array_elements(v_resolvidos) x) z;

  select coalesce(bool_and(coalesce((y->>'ok')::boolean, false)), true),
         coalesce(sum(case when coalesce((y->>'ok')::boolean, false)
                           then (y->>'valor')::numeric else 0 end), 0)
    into v_ok_todos, v_soma
    from jsonb_array_elements(v_resolvidos) y;

  return jsonb_build_object(
    'ok', v_ok_todos and (p_valor_total is null
                          or abs(v_soma - p_valor_total) < 0.01),
    'itens_ok', v_ok_todos,
    'competencia', to_char(v_comp, 'MM/YYYY'),
    'valor_total_informado', p_valor_total,
    'soma_resolvida', v_soma,
    -- 🔴 o confronto que a Sol errou em 09/09: ela escreveu "soma confere" com
    --    R$ 1.290 de um comprovante de R$ 1.722. Aqui a diferenca e explicita.
    'soma_confere', p_valor_total is not null and abs(v_soma - p_valor_total) < 0.01,
    'diferenca', case when p_valor_total is null then null else round(p_valor_total - v_soma, 2) end,
    'alunos', v_resolvidos,
    'resolvidos', (select count(*) from jsonb_array_elements(v_resolvidos) x where (x->>'ok')::boolean),
    'total_itens', jsonb_array_length(v_resolvidos));
end $function$
;

revoke all on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date) is
  'Resolve um pagamento INTEIRO: N alunos, cada um com N faturas. Compoe '
  'composto+canonica+casador pelas variantes _env_v1, com UM envelope por '
  'chamada. `ok` so e verdadeiro quando TODOS os itens resolveram E a soma bate '
  'com o comprovante. Ambiguidade de nome e recusa terminal, nunca sorteio. '
  'Valor declarado e contrato, conferido contra a FATURA. Nao aprova dinheiro.';

-- A regra financeira tem de estar INSTALADA, nao so versionada. Foi a ausencia
-- silenciosa disto que deixou a funcao dizendo ok:true com R$ 777,77 de furo.
do $pos$
declare
  v_def text := pg_get_functiondef('public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)'::regprocedure);
  v_falta text[] := '{}';
begin
  if v_def not like '%nome_ambiguo%' then v_falta := v_falta || 'recusa por ambiguidade'::text; end if;
  if v_def not like '%valor_declarado_nao_bate%' then v_falta := v_falta || 'conferencia do valor declarado'::text; end if;
  if v_def not like '%itens_ok%' then v_falta := v_falta || 'ok exigindo a soma'::text; end if;
  if v_def not like '%v_envelope%' then v_falta := v_falta || 'envelope unico'::text; end if;
  if v_def not like '%_env_v1(v_envelope%' then v_falta := v_falta || 'chamada as variantes _env_v1'::text; end if;
  if has_function_privilege('anon','public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)','EXECUTE')
     or has_function_privilege('authenticated','public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)','EXECUTE') then
    v_falta := v_falta || 'ACL: executavel por anon/authenticated'::text;
  end if;
  if array_length(v_falta,1) > 0 then
    raise exception E'RESOLVER INCOMPLETO — falta:\n  %', array_to_string(v_falta, E'\n  ');
  end if;
  raise notice 'resolver final instalado: ambiguidade, valor declarado, soma, envelope unico, ACL';
end $pos$;
