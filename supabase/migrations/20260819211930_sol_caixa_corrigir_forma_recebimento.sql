-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_corrigir_forma_recebimento(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_mov uuid := nullif(p_payload->>'movimentacao_id','')::uuid;
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_modal text := nullif(p_payload->>'cartao_modalidade','');
  v_parc int := nullif(p_payload->>'cartao_parcelas','')::int;
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := coalesce(p_payload->>'ator_papel','grupo');
  v_m public.caixa_movimentacoes%rowtype;
  v_qualquer boolean;
  v_motivo text;
begin
  if v_mov is null then v_motivo := 'movimentacao_invalida';
  elsif v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then v_motivo := 'forma_invalida';
  elsif v_forma <> 'cartao' then v_modal := null; v_parc := null;
  end if;

  if v_motivo is null then
    select * into v_m from public.caixa_movimentacoes where id = v_mov for update;
    if v_m.id is null then v_motivo := 'movimentacao_nao_encontrada';
    elsif v_m.unidade_id is distinct from v_unidade then v_motivo := 'unidade_divergente';
    elsif v_m.tipo <> 'entrada' or v_m.ambiente <> 'venda' then v_motivo := 'movimentacao_nao_corrigivel';
    elsif coalesce(v_m.criado_por,'') not like 'sol-agente:%' then v_motivo := 'origem_nao_sol';
    elsif v_m.data_movimento < ((now() at time zone 'America/Sao_Paulo')::date - 1) then v_motivo := 'fora_da_janela';
    end if;
  end if;

  if v_motivo is null then
    select autoriza_qualquer_membro into v_qualquer
      from public.sol_caixa_unidade_policy where unidade_id = v_unidade;
    if coalesce(v_qualquer, false) then
      if v_num is null or length(v_num) < 8 then v_motivo := 'ator_sem_numero'; end if;
    elsif not exists (select 1 from public.sol_caixa_autorizados a
                      where a.unidade_id = v_unidade and a.numero = v_num and a.ativo) then
      v_motivo := 'ator_nao_autorizado';
    end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria
      (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
       idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
       movimentacao_id, caixa_diario_id)
    values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
       p_payload->>'preview_message_id', null, v_unidade, (now() at time zone 'America/Sao_Paulo')::date,
       p_payload, 'correcao_recusada', v_motivo, v_mov, null);
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;

  update public.caixa_movimentacoes
     set forma_pagamento = v_forma,
         cartao_modalidade = case when v_forma = 'cartao' then v_modal else null end,
         cartao_parcelas = case when v_forma = 'cartao' then v_parc else null end,
         updated_at = now()
   where id = v_mov;

  update public.sol_caixa_ingestao_recebimentos
     set forma_extraida = v_forma,
         atualizado_em = now()
   where movimentacao_id = v_mov;

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
     p_payload->>'preview_message_id', null, v_unidade, v_m.data_movimento,
     p_payload || jsonb_build_object('antes', jsonb_build_object('forma', v_m.forma_pagamento, 'cartao_modalidade', v_m.cartao_modalidade, 'cartao_parcelas', v_m.cartao_parcelas), 'depois', jsonb_build_object('forma', v_forma, 'cartao_modalidade', case when v_forma='cartao' then v_modal else null end, 'cartao_parcelas', case when v_forma='cartao' then v_parc else null end)),
     'corrigido', null, v_mov, v_m.caixa_diario_id);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov,
    'valor', v_m.valor, 'forma_anterior', v_m.forma_pagamento,
    'forma', v_forma, 'cartao_modalidade', case when v_forma='cartao' then v_modal else null end,
    'descricao', v_m.descricao);
end
$function$;

revoke all on function public.sol_caixa_corrigir_forma_recebimento(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_corrigir_forma_recebimento(jsonb) to service_role;
