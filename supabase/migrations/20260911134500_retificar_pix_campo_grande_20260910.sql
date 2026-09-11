-- Retificacao auditavel de incidente pontual no caixa de Campo Grande em 10/09/2026.
-- O recebimento de R$ 2.034,90 foi registrado como dinheiro, embora tenha sido Pix,
-- contaminando o saldo fisico do fechamento e o carry-over do dia seguinte.

do $$
declare
  v_unidade_id uuid;
  v_caixa public.caixas_diarios%rowtype;
  v_mov public.caixa_movimentacoes%rowtype;
  v_antes_mov jsonb;
  v_antes_caixa jsonb;
  v_depois_mov jsonb;
  v_depois_caixa jsonb;
  v_saldo numeric;
  v_idempotency_key constant text := 'retificar-cg-20260910-2034-90-dinheiro-para-pix-v1';
begin
  if exists (
    select 1
    from public.sol_caixa_operacoes_auditoria_v1
    where idempotency_key = v_idempotency_key
      and resultado = 'corrigido'
  ) then
    return;
  end if;

  select id
    into v_unidade_id
  from public.unidades
  where nome = 'Campo Grande';

  -- Ambientes novos/efemeros nao possuem o incidente historico.
  if v_unidade_id is null then
    return;
  end if;

  select *
    into v_caixa
  from public.caixas_diarios
  where unidade_id = v_unidade_id
    and data_caixa = date '2026-09-10'
  for update;

  if v_caixa.id is null then
    return;
  end if;

  if v_caixa.status <> 'fechado'
     or v_caixa.saldo_inicial_cofre <> 276.20
     or v_caixa.saldo_final_calculado <> 2311.10
     or v_caixa.saldo_final_conferido <> 2311.10 then
    raise exception 'precondicao_caixa_cg_20260910_divergente';
  end if;

  select m.*
    into strict v_mov
  from public.caixa_movimentacoes m
  where m.caixa_diario_id = v_caixa.id
    and m.data_movimento = date '2026-09-10'
    and m.valor = 2034.90
    and m.forma_pagamento = 'dinheiro'
    and m.created_at = timestamptz '2026-09-10 23:31:30.269388+00'
  for update;

  if v_mov.tipo <> 'entrada' or v_mov.ambiente <> 'venda' then
    raise exception 'precondicao_movimento_cg_20260910_divergente';
  end if;

  v_antes_mov := to_jsonb(v_mov);
  v_antes_caixa := to_jsonb(v_caixa);

  update public.caixa_movimentacoes
     set forma_pagamento = 'pix',
         cartao_modalidade = null,
         cartao_parcelas = null,
         updated_at = now()
   where id = v_mov.id
   returning to_jsonb(public.caixa_movimentacoes.*) into v_depois_mov;

  v_saldo := public.sol_caixa_saldo_fisico_v1(v_caixa.id);
  if v_saldo <> 276.20 then
    raise exception 'saldo_fisico_cg_20260910_inesperado: %', v_saldo;
  end if;

  update public.caixas_diarios
     set saldo_final_calculado = v_saldo,
         saldo_final_conferido = v_saldo,
         fechado_por = case
           when fechado_por = 'Jhon' then 'Jhonatan Vicente'
           else fechado_por
         end,
         updated_at = now()
   where id = v_caixa.id
   returning to_jsonb(public.caixas_diarios.*) into v_depois_caixa;

  insert into public.sol_caixa_operacoes_auditoria_v1 (
    operacao,
    idempotency_key,
    unidade_id,
    caixa_diario_id,
    movimentacao_id,
    ator_papel,
    motivo,
    payload,
    antes,
    depois,
    resultado
  ) values (
    'retificar_forma_pagamento_historica',
    v_idempotency_key,
    v_unidade_id,
    v_caixa.id,
    v_mov.id,
    'alfredo_manutencao_aprovada_por_alf',
    'Pix de R$ 2.034,90 registrado como dinheiro em 10/09/2026; saldo fisico confirmado em R$ 276,20.',
    jsonb_build_object(
      'data_caixa', '2026-09-10',
      'forma_anterior', 'dinheiro',
      'forma_correta', 'pix',
      'valor', 2034.90,
      'saldo_fisico_confirmado', 276.20
    ),
    jsonb_build_object('movimentacao', v_antes_mov, 'caixa', v_antes_caixa),
    jsonb_build_object('movimentacao', v_depois_mov, 'caixa', v_depois_caixa),
    'corrigido'
  );

  insert into public.sol_caixa_lancamento_auditoria (
    ator_papel,
    idempotency_key,
    unidade_id,
    data_caixa,
    payload,
    resultado,
    motivo,
    movimentacao_id,
    caixa_diario_id
  ) values (
    'alfredo_manutencao_aprovada_por_alf',
    v_idempotency_key,
    v_unidade_id,
    date '2026-09-10',
    jsonb_build_object(
      'forma_anterior', 'dinheiro',
      'forma_correta', 'pix',
      'valor', 2034.90,
      'saldo_final_anterior', 2311.10,
      'saldo_final_corrigido', v_saldo
    ),
    'retificacao_admin_concluida',
    'Correcao pontual aprovada pelo Alf; nenhuma movimentacao foi apagada ou duplicada.',
    v_mov.id,
    v_caixa.id
  );
end
$$;
