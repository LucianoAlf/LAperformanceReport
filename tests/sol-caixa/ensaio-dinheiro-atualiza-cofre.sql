-- Prova de regressao do incidente Barra 10/09/2026.
-- Uma venda em dinheiro aparece uma vez no ledger comercial e tambem altera o
-- saldo fisico. Pix continua fora do cofre. O teste inteiro faz rollback.

\set ON_ERROR_STOP on
begin;

do $teste$
declare
  v_unidade constant uuid := '11111111-1111-1111-1111-111111111111';
  v_caixa uuid;
  v_pix uuid;
  v_dinheiro uuid;
  v_cofre_entrada uuid;
  v_cofre_saida uuid;
  v_saldo numeric;
  v_dados jsonb;
  v_snapshot jsonb;
  v_def text;
begin
  insert into public.caixas_diarios (
    unidade_id, data_caixa, status, saldo_inicial_cofre,
    saldo_final_calculado, aberto_por
  ) values (
    v_unidade, date '2099-09-10', 'aberto', 62.80, 62.80, 'ensaio'
  ) returning id into v_caixa;

  insert into public.caixa_movimentacoes (
    caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
    forma_pagamento, categoria, descricao, valor, criado_por
  ) values (
    v_caixa, v_unidade, date '2099-09-10', 'venda', 'entrada',
    'pix', 'parcela', 'Recebimento Pix', 190.00, 'ensaio'
  ) returning id into v_pix;

  select saldo_final_calculado into v_saldo
  from public.caixas_diarios where id = v_caixa;
  if v_saldo <> 62.80 then
    raise exception 'pix_alterou_cofre: %', v_saldo;
  end if;

  insert into public.caixa_movimentacoes (
    caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
    forma_pagamento, categoria, descricao, valor, criado_por
  ) values (
    v_caixa, v_unidade, date '2099-09-10', 'venda', 'entrada',
    'dinheiro', 'parcela', 'Recebimento em dinheiro', 450.00, 'ensaio'
  ) returning id into v_dinheiro;

  select saldo_final_calculado into v_saldo
  from public.caixas_diarios where id = v_caixa;
  if v_saldo <> 512.80 then
    raise exception 'dinheiro_nao_atualizou_cofre: %', v_saldo;
  end if;

  v_dados := public.sol_caixa_dados_fechamento(v_caixa);
  if (v_dados->>'saldoFinal')::numeric <> 512.80 then
    raise exception 'fechamento_saldo_errado: %', v_dados->>'saldoFinal';
  end if;
  if (v_dados#>>'{vendasPorForma,dinheiro}')::numeric <> 450.00 then
    raise exception 'venda_dinheiro_sumiu_do_resumo: %', v_dados#>>'{vendasPorForma,dinheiro}';
  end if;
  if jsonb_array_length(v_dados->'cofreEntradas') <> 1 then
    raise exception 'entrada_fisica_nao_aparece_uma_vez: %', v_dados->'cofreEntradas';
  end if;
  if jsonb_array_length(v_dados->'detalhes') <> 2 then
    raise exception 'detalhes_de_venda_incompletos: %', v_dados->'detalhes';
  end if;

  v_snapshot := public.sol_caixa_snapshot_abertura_fechamento_v3(
    v_unidade, date '2099-09-10', 'fechar_caixa'
  );
  if (v_snapshot#>>'{snapshot,cofre_entradas}')::numeric <> 450.00
     or (v_snapshot#>>'{snapshot,saldo_final_calculado}')::numeric <> 512.80 then
    raise exception 'snapshot_nao_reflete_dinheiro: %', v_snapshot;
  end if;

  update public.caixa_movimentacoes
     set forma_pagamento = 'pix'
   where id = v_dinheiro;
  select saldo_final_calculado into v_saldo
  from public.caixas_diarios where id = v_caixa;
  if v_saldo <> 62.80 then
    raise exception 'update_para_pix_nao_recalculou: %', v_saldo;
  end if;

  update public.caixa_movimentacoes
     set forma_pagamento = 'dinheiro'
   where id = v_dinheiro;
  select saldo_final_calculado into v_saldo
  from public.caixas_diarios where id = v_caixa;
  if v_saldo <> 512.80 then
    raise exception 'update_para_dinheiro_nao_recalculou: %', v_saldo;
  end if;

  delete from public.caixa_movimentacoes where id = v_dinheiro;
  select saldo_final_calculado into v_saldo
  from public.caixas_diarios where id = v_caixa;
  if v_saldo <> 62.80 then
    raise exception 'delete_nao_recalculou: %', v_saldo;
  end if;

  insert into public.caixa_movimentacoes (
    caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
    forma_pagamento, categoria, descricao, valor, criado_por
  ) values (
    v_caixa, v_unidade, date '2099-09-10', 'cofre', 'entrada',
    'dinheiro', 'troco', 'Entrada direta no cofre', 25.00, 'ensaio'
  ) returning id into v_cofre_entrada;

  insert into public.caixa_movimentacoes (
    caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
    forma_pagamento, categoria, descricao, valor, criado_por
  ) values (
    v_caixa, v_unidade, date '2099-09-10', 'cofre', 'saida',
    'dinheiro', 'despesa', 'Saida do cofre', 20.00, 'ensaio'
  ) returning id into v_cofre_saida;

  select saldo_final_calculado into v_saldo
  from public.caixas_diarios where id = v_caixa;
  if v_saldo <> 67.80 then
    raise exception 'entrada_saida_cofre_quebradas: %', v_saldo;
  end if;

  if has_function_privilege('anon', 'public.sol_caixa_saldo_fisico_v1(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.sol_caixa_saldo_fisico_v1(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.sol_caixa_saldo_fisico_v1(uuid)', 'EXECUTE') then
    raise exception 'helper_interno_exposto';
  end if;

  v_def := pg_get_functiondef('public.sol_caixa_lancar_saida(jsonb)'::regprocedure);
  if v_def not like '%sol_caixa_recalcular_cofre(v_caixa)%'
     or v_def like '%m.ambiente=''cofre'' and m.tipo=''entrada''%' then
    raise exception 'lancar_saida_ainda_sobrescreve_formula_canonica';
  end if;

  raise notice 'DINHEIRO ATUALIZA COFRE OK — pix neutro, venda unica, saldo 512,80, update/delete e saida preservados';
end;
$teste$;

rollback;
