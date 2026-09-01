-- 01/09/2026 — REPARO: completa o lote 9499589b (Jhon/CG 18:31) com o item do
-- Davi (R$ 1.290) que o bug do snapshot deixou fora do caixa.
--
-- O "pode" do Jhon às 18:31:45 aprovou o lote INTEIRO de R$ 1.722 (approval V3
-- 15568335-a613-4dd0-9423-69c1d2c7eb44, preview com os 2 itens). O validador de
-- snapshot omitia o item declarado-sem-vínculo do array devolvido (migration
-- 20260901180000, corrigido em 20260901231000) e a RPC gravou só a Thuanny
-- (R$ 432). Este reparo insere a metade que faltou da MESMA autorização — não é
-- lançamento novo. Caixa de CG de 01/09 ainda ABERTO no momento do reparo.
--
-- Guardas: idempotente (ordem 2 já existente = no-op) e aborta se o caixa não
-- estiver mais aberto (aí vira decisão humana, não migration).

do $$
declare
  v_lote uuid := '9499589b-88f4-4075-af17-9c655c657a8b';
  v_caixa uuid := '557ac27a-4ff5-4bb9-b695-d81829505ee2';
  v_unidade uuid := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
  v_mov uuid;
  v_item jsonb;
begin
  if exists (select 1 from public.sol_caixa_lote_itens_v1 where lote_id = v_lote and ordem = 2) then
    raise notice 'reparo ja aplicado — nada a fazer';
    return;
  end if;
  if not exists (select 1 from public.caixas_diarios where id = v_caixa and status = 'aberto') then
    raise exception 'caixa de CG 01/09 nao esta mais aberto — reparo passa a exigir decisao humana';
  end if;

  v_item := jsonb_build_object(
    'ordem', 2,
    'aluno_nome', 'Davi Guilherme De Souza Chaves Ribeiro',
    'aluno_id', 89,
    'valor', 1290,
    'categoria', 'parcela',
    'competencia', '08/2026',
    'canonical_fatura_id', null,
    'sem_vinculo_fatura', true,
    'declarado_pelo_humano', true,
    'descricao', 'Parcela 08/2026 - Davi Guilherme De Souza Chaves Ribeiro · valor declarado (desconto autorizado pelo Jerêh), sem vínculo de fatura'
  );

  insert into public.caixa_movimentacoes(
    caixa_diario_id, unidade_id, data_movimento, ambiente, tipo, forma_pagamento,
    categoria, descricao, valor, criado_por, responsavel, aluno_id, fatura_id)
  values (
    v_caixa, v_unidade, '2026-09-01', 'venda', 'entrada', 'pix',
    'parcela', v_item->>'descricao', 1290,
    'migracao:reparo-lote-incompleto', 'Jhon · via Sol', 89, null)
  returning id into v_mov;

  insert into public.sol_caixa_lote_itens_v1(
    lote_id, ordem, aluno_nome, responsavel_financeiro, competencia, categoria,
    valor, canonical_fatura_id, movimentacao_id, item_json)
  values (
    v_lote, 2, 'Davi Guilherme De Souza Chaves Ribeiro', null, '08/2026', 'parcela',
    1290, null, v_mov, v_item);

  insert into public.sol_caixa_lancamento_auditoria(
    ator_numero, ator_papel, chat_id, idempotency_key, unidade_id, data_caixa,
    payload, resultado, motivo, movimentacao_id, caixa_diario_id)
  values (
    'migracao', 'manutencao', '5521981278047-1544204225@g.us',
    'reparo:' || v_lote || ':2', v_unidade, '2026-09-01',
    v_item, 'lancado_lote',
    'reparo_lote_incompleto_bug_snapshot_declarado — pode do Jhon 18:31:45 cobria os 2 itens (approval V3 15568335-a613-4dd0-9423-69c1d2c7eb44); validador omitia item declarado e a RPC gravou 1 de 2. Raiz: 20260901180000; fix: 20260901231000.',
    v_mov, v_caixa);

  raise notice 'reparo aplicado: movimentacao % (R$ 1.290, Davi) no caixa %', v_mov, v_caixa;
end $$;
