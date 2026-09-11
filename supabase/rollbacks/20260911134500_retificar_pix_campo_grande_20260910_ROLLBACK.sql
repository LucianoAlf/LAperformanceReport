-- Rollback de emergencia da retificacao de 11/09/2026.
-- Executar somente com nova aprovacao explicita: restaura o estado sabidamente incorreto.

do $$
declare
  v_caixa public.caixas_diarios%rowtype;
  v_mov public.caixa_movimentacoes%rowtype;
begin
  select c.*
    into strict v_caixa
  from public.caixas_diarios c
  join public.unidades u on u.id = c.unidade_id
  where u.nome = 'Campo Grande'
    and c.data_caixa = date '2026-09-10'
  for update of c;

  select m.*
    into strict v_mov
  from public.caixa_movimentacoes m
  where m.caixa_diario_id = v_caixa.id
    and m.data_movimento = date '2026-09-10'
    and m.valor = 2034.90
    and m.forma_pagamento = 'pix'
    and m.created_at = timestamptz '2026-09-10 23:31:30.269388+00'
  for update;

  if v_caixa.saldo_final_calculado <> 276.20
     or v_caixa.saldo_final_conferido <> 276.20 then
    raise exception 'precondicao_rollback_cg_20260910_divergente';
  end if;

  update public.caixa_movimentacoes
     set forma_pagamento = 'dinheiro',
         updated_at = now()
   where id = v_mov.id;

  update public.caixas_diarios
     set saldo_final_calculado = 2311.10,
         saldo_final_conferido = 2311.10,
         fechado_por = case
           when fechado_por = 'Jhonatan Vicente' then 'Jhon'
           else fechado_por
         end,
         updated_at = now()
   where id = v_caixa.id;

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
    'rollback_retificacao_forma_pagamento_historica',
    'rollback-retificar-cg-20260910-2034-90-v1',
    v_caixa.unidade_id,
    v_caixa.id,
    v_mov.id,
    'manutencao_admin',
    'Rollback de emergencia da retificacao de 11/09/2026.',
    jsonb_build_object('forma', 'pix', 'saldo_final', 276.20),
    jsonb_build_object('movimentacao', to_jsonb(v_mov), 'caixa', to_jsonb(v_caixa)),
    jsonb_build_object('forma', 'dinheiro', 'saldo_final', 2311.10),
    'rollback_concluido'
  );
end
$$;
