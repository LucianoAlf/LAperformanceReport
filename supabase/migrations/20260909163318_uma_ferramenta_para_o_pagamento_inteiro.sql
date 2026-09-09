-- 🔴 N ALUNOS × N FATURAS NÃO TINHA FERRAMENTA (09/09/2026).
--
-- A Mayra mandou um PIX de R$ 1.722,00 cobrindo **dois alunos**, um deles com
-- **quatro cursos**: Davi (Harmonia 149 + Guitarra 380 + Teclado 367 + Canto
-- 394 = 1.290) e Thuanny (Canto 432). Gastou 19 minutos e 6 mensagens, e
-- desistiu. O mesmo par tinha sido lançado com sucesso em 01/09 (lote
-- `sol_caixa_lotes_v1` de 01/09 18:31, R$ 1.722, 2 itens) — ou seja, do ponto
-- de vista do time isto É regressão, mesmo sem ninguém ter mexido no código.
--
-- O motivo é estrutural: as duas ferramentas que existiam cobrem metades
-- diferentes do problema e nenhuma cobre a interseção.
--     sol_caixa_resolver_multi_aluno_v1     → N alunos, UMA fatura cada
--     sol_caixa_resolver_composto_aluno_v1  → UM aluno, N faturas (exige 2+)
-- Medido: para este caso a primeira devolve `item_nao_validado` no Davi (o valor
-- dele é soma de 4) e a segunda devolve `ok:false` na Thuanny (ela tem 1).
--
-- Esta função é a interseção, e é COMPOSIÇÃO — não reimplementa regra nenhuma:
-- para cada aluno tenta a composta e, se ela recusar, cai no casador simples.
-- Reescrever as condições aqui seria a causa-raiz das duplicatas de renovação.
--
-- O que ela devolve por aluno, que é o que a consultora precisa ver antes de
-- autorizar: as faturas com curso e competência, o **valor até o vencimento**,
-- o **valor com multa/mora** se estiver atrasada, e o **responsável financeiro**.
--
-- ⚠️ NÃO decide dinheiro. Devolve fato; quem aprova é o "pode" humano.
-- ⚠️ Item que não resolve NÃO derruba o resto — volta com `ok:false` e o motivo
--    dele, para a Sol poder dizer "resolvi 1 de 2 e falta este". Recusar tudo em
--    silêncio é o que fazia a Mayra reenviar o mesmo comprovante.
-- ⚠️ Ambiguidade de nome continua sendo RECUSA, nunca sorteio: quem decide é
--    `sol_caixa_casar_parcela`/`sol_nome_mesma_pessoa_v1`, que já aplicam a
--    regra de primeiro-nome de 29/08.
-- ⚠️ `sol_caixa_responsavel_aluno` devolve JSONB, não texto — o ramo `parcela`
--    precisa de `->>'responsavel_nome'`, senão o envelope inteiro vai para o
--    card na frente da consultora (corrigido em 20260909163354).
create or replace function public.sol_caixa_resolver_pagamento_v1(
  p_unidade_id uuid,
  p_itens jsonb,               -- [{aluno_nome, valor?}, ...] — o que o HUMANO declarou
  p_valor_total numeric,
  p_competencia date default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_item        jsonb;
  v_nome        text;
  v_valor       numeric;
  v_comp        date := coalesce(p_competencia, date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date);
  v_composto    jsonb;
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
    v_composto := sol_caixa_resolver_composto_aluno_v1(jsonb_build_object(
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

    -- 2) senao, casador SIMPLES (uma fatura) — traz valor em dia e apos vencimento
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

  return jsonb_build_object(
    'ok', v_ok_todos,
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
end $function$;

revoke execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  from public, anon;
grant execute on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_resolver_pagamento_v1(uuid, jsonb, numeric, date) is
  'Resolve um pagamento INTEIRO: N alunos, cada um com N faturas (curso, '
  'passaporte, taxa). Compoe composto+casador, nunca reimplementa a regra. '
  'Devolve faturas, responsavel financeiro, valor em dia e valor com multa, e '
  'diz explicitamente se a soma confere com o comprovante. Nao aprova dinheiro.';
