-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create or replace function public.sol_caixa_lancar_saida(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'despesa'));
  v_desc text := nullif(trim(coalesce(p_payload->>'descricao','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_env text := nullif(trim(coalesce(p_payload->>'enviado_por','')),'');
  v_aut text := nullif(trim(coalesce(p_payload->>'autorizado_por','')),'');
  v_resp text;
  v_caixa uuid;
  v_mov uuid;
  v_mov_existe uuid;
  v_motivo text;
  v_saldo numeric;
begin
  if v_key is not null then
    select movimentacao_id into v_mov_existe
      from public.sol_caixa_lancamento_auditoria
      where idempotency_key = v_key
        and resultado = 'saida_lancada'
        and movimentacao_id is not null
      order by criado_em desc
      limit 1;
    if v_mov_existe is not null then
      return jsonb_build_object('ok', true, 'ja_lancado', true, 'movimentacao_id', v_mov_existe);
    end if;
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_valor is null or v_valor <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma <> 'dinheiro' then v_motivo := 'saida_cofre_so_dinheiro';
  elsif v_categoria !~ '^[a-z0-9_-]+$' or length(trim(v_categoria)) < 2 then v_motivo := 'categoria_invalida';
  elsif not public.sol_caixa_ator_ok(v_unidade, v_num) then v_motivo := 'ator_nao_autorizado';
  end if;

  if v_motivo is null then
    select id into v_caixa
    from public.caixas_diarios
    where unidade_id = v_unidade
      and data_caixa = v_data
      and status = 'aberto'
    order by aberto_em desc
    limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria
      (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
       idempotency_key, unidade_id, data_caixa, payload, resultado, motivo)
    values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
       p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'saida_recusada', v_motivo);
    return jsonb_build_object('ok', false, 'motivo', v_motivo, 'data', v_data);
  end if;

  if v_desc is null or length(v_desc) < 3 then
    v_desc := initcap(v_categoria);
  end if;

  v_resp := case
    when v_aut is not null and v_env is not null and lower(v_aut) is distinct from lower(v_env)
      then v_aut || ' (aut.) · ' || v_env || ' (env.) · via Sol'
    when v_aut is not null then v_aut || ' · via Sol'
    when v_env is not null then v_env || ' · via Sol'
    else 'Sol (agente)' end;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, criado_por, responsavel)
  values
    (v_caixa, v_unidade, v_data, 'cofre', 'saida',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp)
  returning id into v_mov;

  select coalesce(c.saldo_inicial_cofre, 0)
       + coalesce((select sum(m.valor) from public.caixa_movimentacoes m where m.caixa_diario_id = v_caixa and m.ambiente='cofre' and m.tipo='entrada'), 0)
       - coalesce((select sum(m.valor) from public.caixa_movimentacoes m where m.caixa_diario_id = v_caixa and m.ambiente='cofre' and m.tipo='saida'), 0)
    into v_saldo
  from public.caixas_diarios c
  where c.id = v_caixa;

  update public.caixas_diarios
    set saldo_final_calculado = v_saldo,
        updated_at = now()
    where id = v_caixa;

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
     p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'saida_lancada', null,
     v_mov, v_caixa);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov,
    'caixa_diario_id', v_caixa, 'valor', v_valor, 'forma', v_forma,
    'categoria', v_categoria, 'descricao', v_desc, 'responsavel', v_resp,
    'data', v_data, 'tipo', 'saida', 'ambiente', 'cofre', 'saldo_final', v_saldo);
end
$function$;

revoke all on function public.sol_caixa_lancar_saida(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_lancar_saida(jsonb) to service_role;

comment on function public.sol_caixa_lancar_saida(jsonb) is
  'Sol Caixa: lancamento auditado de saida de cofre em dinheiro, com caixa aberto, autorizador e idempotencia.';
