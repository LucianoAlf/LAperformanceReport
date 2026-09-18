-- Rollback exato do reparo de competencia de Campo Grande.
-- Recoloca somente o fatura_id anterior; nao altera valor, caixa ou descricao.

do $rollback$
declare
  v_unidade_id constant uuid := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
  v_movimento_id constant uuid := 'c75e9dfa-93db-4336-9b50-2ab216593635';
  v_fatura_anterior_id constant uuid := '423cb4a7-bd1f-4edb-bf48-1c2d4c5d4781';
  v_fatura_correta_id constant uuid := '1180b854-72bf-4352-a37a-7a777f9044aa';
  v_reparo_key constant text := 'reparar-cg-competencia-20260917-mov-c75e9dfa-v1';
  v_rollback_key constant text := 'rollback-reparar-cg-competencia-20260917-mov-c75e9dfa-v1';
  v_mov public.caixa_movimentacoes%rowtype;
  v_antes jsonb;
  v_depois jsonb;
  v_fingerprint_antes jsonb;
  v_fingerprint_depois jsonb;
begin
  if exists (
    select 1
      from public.sol_caixa_operacoes_auditoria_v1
     where idempotency_key = v_rollback_key
       and resultado = 'rollback_concluido'
  ) then
    return;
  end if;

  if not exists (
    select 1
      from public.sol_caixa_operacoes_auditoria_v1
     where idempotency_key = v_reparo_key
       and resultado = 'corrigido'
  ) then
    raise exception 'ROLLBACK_REPARO_CG_SEM_REPARO_CONFIRMADO';
  end if;

  select * into strict v_mov
    from public.caixa_movimentacoes
   where id = v_movimento_id
   for update;

  if v_mov.unidade_id <> v_unidade_id
     or v_mov.fatura_id <> v_fatura_correta_id
     or v_mov.valor <> 397.00
     or v_mov.forma_pagamento <> 'pix'
     or v_mov.categoria <> 'parcela'
     or v_mov.descricao not like '%09/2026%' then
    raise exception 'ROLLBACK_REPARO_CG_PRECONDICAO_DIVERGENTE';
  end if;

  if not exists (
    select 1 from public.emusys_faturas
     where id = v_fatura_anterior_id
       and unidade_id = v_unidade_id
       and competencia = date '2026-10-01'
  ) then
    raise exception 'ROLLBACK_REPARO_CG_FATURA_ANTERIOR_DIVERGENTE';
  end if;

  v_antes := to_jsonb(v_mov);
  v_fingerprint_antes := to_jsonb(v_mov) - 'fatura_id' - 'updated_at';

  update public.caixa_movimentacoes
     set fatura_id = v_fatura_anterior_id
   where id = v_movimento_id
     and fatura_id = v_fatura_correta_id
  returning to_jsonb(public.caixa_movimentacoes.*) into v_depois;

  if v_depois is null then
    raise exception 'ROLLBACK_REPARO_CG_UPDATE_NAO_APLICADO';
  end if;

  select to_jsonb(m) - 'fatura_id' - 'updated_at'
    into v_fingerprint_depois
    from public.caixa_movimentacoes m
   where m.id = v_movimento_id;

  if v_fingerprint_depois is distinct from v_fingerprint_antes then
    raise exception 'ROLLBACK_REPARO_CG_CAMPO_FINANCEIRO_ALHEIO_AO_VINCULO_ALTERADO';
  end if;

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
    'rollback_reparar_competencia_fatura_historica',
    v_rollback_key,
    v_unidade_id,
    v_mov.caixa_diario_id,
    v_movimento_id,
    'manutencao_admin',
    'Rollback exato do vinculo de competencia; valor, caixa e descricao preservados.',
    jsonb_build_object(
      'fatura_restaurada_id', v_fatura_anterior_id,
      'competencia_restaurada', '2026-10-01'
    ),
    jsonb_build_object('movimentacao', v_antes),
    jsonb_build_object('movimentacao', v_depois),
    'rollback_concluido'
  );
end
$rollback$;
