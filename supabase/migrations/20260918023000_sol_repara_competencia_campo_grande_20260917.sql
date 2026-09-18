-- Reparo pontual e auditavel do vinculo de competencia em Campo Grande.
--
-- Incidente: um recebimento unico de R$ 397,00 em 17/09/2026 teve a
-- descricao corrigida de 10/2026 para 09/2026, mas o fatura_id permaneceu
-- ligado a outubro. Este reparo muda somente o vinculo da fatura.
--
-- Nao altera valor, forma, categoria, aluno, caixa ou descricao.

do $reparo$
declare
  v_unidade_id constant uuid := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
  v_movimento_id constant uuid := 'c75e9dfa-93db-4336-9b50-2ab216593635';
  v_fatura_anterior_id constant uuid := '423cb4a7-bd1f-4edb-bf48-1c2d4c5d4781';
  v_fatura_correta_id constant uuid := '1180b854-72bf-4352-a37a-7a777f9044aa';
  v_idempotency_key constant text := 'reparar-cg-competencia-20260917-mov-c75e9dfa-v1';
  v_mov public.caixa_movimentacoes%rowtype;
  v_fatura_anterior public.emusys_faturas%rowtype;
  v_fatura_correta public.emusys_faturas%rowtype;
  v_antes jsonb;
  v_depois jsonb;
  v_fingerprint_antes jsonb;
  v_fingerprint_depois jsonb;
begin
  if exists (
    select 1
      from public.sol_caixa_operacoes_auditoria_v1
     where idempotency_key = v_idempotency_key
       and resultado = 'corrigido'
  ) then
    return;
  end if;

  -- Ambientes efemeros sem o incidente nao recebem dado sintetico.
  if not exists (
    select 1 from public.caixa_movimentacoes where id = v_movimento_id
  ) then
    return;
  end if;

  select * into strict v_mov
    from public.caixa_movimentacoes
   where id = v_movimento_id
   for update;

  if v_mov.unidade_id <> v_unidade_id
     or v_mov.data_movimento <> date '2026-09-17'
     or v_mov.tipo <> 'entrada'
     or v_mov.ambiente <> 'venda'
     or v_mov.forma_pagamento <> 'pix'
     or v_mov.categoria <> 'parcela'
     or v_mov.valor <> 397.00
     or v_mov.aluno_id <> 1747
     or v_mov.fatura_id <> v_fatura_anterior_id
     or v_mov.descricao not like '%09/2026%' then
    raise exception 'REPARO_CG_PRECONDICAO_MOVIMENTO_DIVERGENTE';
  end if;

  select * into strict v_fatura_anterior
    from public.emusys_faturas
   where id = v_fatura_anterior_id
   for share;

  select * into strict v_fatura_correta
    from public.emusys_faturas
   where id = v_fatura_correta_id
   for share;

  if v_fatura_anterior.unidade_id <> v_unidade_id
     or v_fatura_correta.unidade_id <> v_unidade_id
     or v_fatura_anterior.emusys_student_id <> v_fatura_correta.emusys_student_id
     or v_fatura_anterior.competencia <> date '2026-10-01'
     or v_fatura_anterior.status <> 'aberta'
     or v_fatura_correta.competencia <> date '2026-09-01'
     or v_fatura_correta.status <> 'paga'
     or v_fatura_correta.valor_original <> 447.00
     or v_fatura_correta.valor_pago <> 397.00
     or v_fatura_correta.data_pagamento <> date '2026-09-16' then
    raise exception 'REPARO_CG_PRECONDICAO_FATURAS_DIVERGENTE';
  end if;

  if exists (
    select 1
      from public.caixa_movimentacoes m
     where m.unidade_id = v_unidade_id
       and m.id <> v_movimento_id
       and m.fatura_id = v_fatura_correta_id
       and m.tipo = 'entrada'
  ) then
    raise exception 'REPARO_CG_FATURA_CORRETA_JA_VINCULADA_A_OUTRO_RECEBIMENTO';
  end if;

  v_antes := to_jsonb(v_mov);
  v_fingerprint_antes := to_jsonb(v_mov) - 'fatura_id' - 'updated_at';

  update public.caixa_movimentacoes
     set fatura_id = v_fatura_correta_id
   where id = v_movimento_id
     and fatura_id = v_fatura_anterior_id
  returning to_jsonb(public.caixa_movimentacoes.*) into v_depois;

  if v_depois is null then
    raise exception 'REPARO_CG_UPDATE_NAO_APLICADO';
  end if;

  select to_jsonb(m) - 'fatura_id' - 'updated_at'
    into v_fingerprint_depois
    from public.caixa_movimentacoes m
   where m.id = v_movimento_id;

  if v_fingerprint_depois is distinct from v_fingerprint_antes then
    raise exception 'REPARO_CG_CAMPO_FINANCEIRO_ALHEIO_AO_VINCULO_ALTERADO';
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
    'reparar_competencia_fatura_historica',
    v_idempotency_key,
    v_unidade_id,
    v_mov.caixa_diario_id,
    v_movimento_id,
    'alfredo_manutencao_aguardando_gate_financeiro',
    'Descricao humana corrigida para 09/2026; vinculo persistido permaneceu em 10/2026.',
    jsonb_build_object(
      'data_caixa', '2026-09-17',
      'valor_preservado', 397.00,
      'competencia_anterior', '2026-10-01',
      'competencia_correta', '2026-09-01',
      'fatura_anterior_id', v_fatura_anterior_id,
      'fatura_correta_id', v_fatura_correta_id
    ),
    jsonb_build_object('movimentacao', v_antes),
    jsonb_build_object('movimentacao', v_depois),
    'corrigido'
  );

  if not exists (
    select 1
      from public.caixa_movimentacoes m
     where m.id = v_movimento_id
       and m.fatura_id = v_fatura_correta_id
       and m.valor = 397.00
       and m.forma_pagamento = 'pix'
       and m.categoria = 'parcela'
  ) then
    raise exception 'REPARO_CG_READBACK_REPROVADO';
  end if;
end
$reparo$;
