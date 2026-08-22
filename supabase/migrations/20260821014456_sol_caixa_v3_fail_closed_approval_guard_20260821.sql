-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

-- Sol Caixa V3: guarda server-side obrigatória para writes financeiros vindos do ledger/approval.

create table if not exists public.sol_caixa_v3_approval_consumos_v1 (
  approval_id uuid primary key references public.sol_caixa_shadow_approvals_v1(id) on delete restrict,
  preview_id uuid not null references public.sol_caixa_shadow_previews_v1(id) on delete restrict,
  unidade_id uuid not null,
  operacao text not null,
  idempotency_key text,
  payload_hash text,
  criado_em timestamptz not null default now()
);

alter table public.sol_caixa_v3_approval_consumos_v1 enable row level security;
revoke all on table public.sol_caixa_v3_approval_consumos_v1 from public, anon, authenticated, sol_acesso_restrito, sol_caixa_readonly;

drop function if exists public.sol_caixa_v3_validar_approval_v1(jsonb, text);
create or replace function public.sol_caixa_v3_validar_approval_v1(p_payload jsonb, p_operacao text default 'lancar_recebimento')
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_preview_id uuid := nullif(p_payload->>'v3_preview_id','')::uuid;
  v_approval_id uuid := nullif(p_payload->>'v3_approval_id','')::uuid;
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_valor_centavos int;
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''), ''));
  v_forma text := lower(coalesce(nullif(p_payload->>'forma',''), ''));
  v_chat text := coalesce(nullif(p_payload->>'grupo_jid',''), nullif(p_payload->>'chat_id',''));
  v_actor_hash text := nullif(p_payload->>'v3_actor_id_hash','');
  v_preview_hash text := nullif(p_payload->>'v3_preview_hash','');
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_p public.sol_caixa_shadow_previews_v1%rowtype;
  v_a public.sol_caixa_shadow_approvals_v1%rowtype;
  v_e public.sol_caixa_shadow_eventos_v1%rowtype;
  v_motivo text;
begin
  if p_payload ? 'valor' and nullif(p_payload->>'valor','') is not null then
    v_valor_centavos := round((p_payload->>'valor')::numeric * 100)::int;
  end if;

  if v_preview_id is null then v_motivo := 'v3_preview_id_obrigatorio';
  elsif v_approval_id is null then v_motivo := 'v3_approval_id_obrigatorio';
  elsif v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_chat is null then v_motivo := 'grupo_jid_obrigatorio';
  elsif v_actor_hash is null then v_motivo := 'v3_actor_hash_obrigatorio';
  elsif v_preview_hash is null then v_motivo := 'v3_preview_hash_obrigatorio';
  end if;

  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'motivo', v_motivo);
  end if;

  select * into v_p
  from public.sol_caixa_shadow_previews_v1
  where id = v_preview_id
  for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'preview_v3_nao_encontrado');
  end if;

  select * into v_a
  from public.sol_caixa_shadow_approvals_v1
  where id = v_approval_id
    and preview_id = v_preview_id
  for update;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'approval_v3_nao_encontrado');
  end if;

  select * into v_e
  from public.sol_caixa_shadow_eventos_v1
  where id = v_p.evento_id;
  if v_e.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'evento_v3_nao_encontrado');
  end if;

  if v_a.decision <> 'approved' then
    return jsonb_build_object('ok', false, 'motivo', 'approval_nao_aprovado');
  elsif v_a.criado_em < now() - interval '4 hours' then
    return jsonb_build_object('ok', false, 'motivo', 'approval_expirado');
  elsif v_p.unidade_id is distinct from v_unidade then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_divergente_v3');
  elsif v_e.unidade_id is not null and v_e.unidade_id is distinct from v_unidade then
    return jsonb_build_object('ok', false, 'motivo', 'evento_unidade_divergente_v3');
  elsif v_e.chat_id_hash <> md5(v_chat) then
    return jsonb_build_object('ok', false, 'motivo', 'grupo_divergente_v3');
  elsif v_a.actor_id_hash is distinct from v_actor_hash then
    return jsonb_build_object('ok', false, 'motivo', 'ator_divergente_v3');
  elsif v_p.preview_hash <> v_preview_hash then
    return jsonb_build_object('ok', false, 'motivo', 'preview_hash_divergente_v3');
  elsif v_valor_centavos is not null and v_p.valor_centavos is not null and v_p.valor_centavos <> v_valor_centavos then
    return jsonb_build_object('ok', false, 'motivo', 'valor_divergente_v3');
  elsif v_forma <> '' and v_p.forma is not null and lower(v_p.forma) <> v_forma then
    return jsonb_build_object('ok', false, 'motivo', 'forma_divergente_v3');
  elsif v_categoria <> '' and v_p.categoria is not null and lower(v_p.categoria) <> v_categoria then
    return jsonb_build_object('ok', false, 'motivo', 'categoria_divergente_v3');
  end if;

  insert into public.sol_caixa_v3_approval_consumos_v1
    (approval_id, preview_id, unidade_id, operacao, idempotency_key, payload_hash)
  values
    (v_approval_id, v_preview_id, v_unidade, coalesce(nullif(p_operacao,''), 'write_financeiro'), v_key, md5(p_payload::text));

  return jsonb_build_object('ok', true, 'preview_id', v_preview_id, 'approval_id', v_approval_id, 'operacao', p_operacao);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'motivo', 'approval_v3_ja_consumido');
end;
$$;

revoke all on function public.sol_caixa_v3_validar_approval_v1(jsonb, text) from public, anon, authenticated, sol_caixa_readonly;
grant execute on function public.sol_caixa_v3_validar_approval_v1(jsonb, text) to sol_acesso_restrito, service_role;

create or replace function public.sol_caixa_lancar_recebimento(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'parcela'));
  v_aluno text := nullif(trim(coalesce(p_payload->>'aluno','')),'');
  v_desc text := nullif(trim(coalesce(p_payload->>'descricao','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_modal text := nullif(p_payload->>'cartao_modalidade','');
  v_parc int := nullif(p_payload->>'cartao_parcelas','')::int;
  v_env text := nullif(trim(coalesce(p_payload->>'enviado_por','')),'');
  v_aut text := nullif(trim(coalesce(p_payload->>'autorizado_por','')),'');
  v_respfin text := nullif(trim(coalesce(p_payload->>'responsavel_financeiro','')),'');
  v_resp text;
  v_qualquer boolean;
  v_caixa uuid; v_mov uuid; v_status text; v_mov_existe uuid;
  v_res text; v_motivo text; v_v3 jsonb;
begin
  if v_key is not null then
    select status, movimentacao_id into v_status, v_mov_existe
      from public.sol_caixa_ingestao_recebimentos where idempotency_key = v_key;
    if v_status = 'lancado' then
      return jsonb_build_object('ok', true, 'ja_lancado', true, 'movimentacao_id', v_mov_existe);
    end if;
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_valor is null or v_valor <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then v_motivo := 'forma_invalida';
  elsif v_categoria !~ '^[a-z0-9_-]+$' or length(v_categoria) < 2 then v_motivo := 'categoria_invalida';
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

  if v_motivo is null then
    select id into v_caixa from public.caixas_diarios
      where unidade_id = v_unidade and data_caixa = v_data and status = 'aberto'
      order by aberto_em desc limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is null then
    v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload, 'lancar_recebimento');
    if not coalesce((v_v3->>'ok')::boolean, false) then
      v_motivo := coalesce(v_v3->>'motivo', 'approval_v3_invalido');
    end if;
  end if;

  if v_motivo is not null then
    v_res := 'recusado';
    insert into public.sol_caixa_lancamento_auditoria
      (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
       idempotency_key, unidade_id, data_caixa, payload, resultado, motivo)
    values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
       p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, v_res, v_motivo);
    return jsonb_build_object('ok', false, 'motivo', v_motivo, 'data', v_data);
  end if;

  if v_desc is null or length(v_desc) < 3 then
    v_desc := trim(concat_ws(' ', initcap(v_categoria),
                             case when v_aluno is not null then '- '||v_aluno end));
    if length(v_desc) < 3 then v_desc := 'Recebimento via Sol'; end if;
  end if;
  if v_respfin is not null and position(lower(v_respfin) in lower(v_desc)) = 0 then
    v_desc := v_desc || ' · resp. ' || v_respfin;
  end if;
  v_resp := case
    when v_aut is not null and v_env is not null and lower(v_aut) is distinct from lower(v_env)
      then v_aut || ' (aut.) · ' || v_env || ' (env.) · via Sol'
    when v_aut is not null then v_aut || ' · via Sol'
    when v_env is not null then v_env || ' · via Sol'
    else 'Sol (agente)' end;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, criado_por, responsavel,
     cartao_modalidade, cartao_parcelas)
  values
    (v_caixa, v_unidade, v_data, 'venda', 'entrada',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp, v_modal, v_parc)
  returning id into v_mov;

  if v_key is not null then
    update public.sol_caixa_ingestao_recebimentos
      set status = 'lancado', movimentacao_id = v_mov, lancado_em = now(),
          lancado_por = v_num, valor_extraido = v_valor, forma_extraida = v_forma,
          categoria_extraida = v_categoria, aluno_extraido = v_aluno,
          preview_message_id = coalesce(preview_message_id, p_payload->>'preview_message_id'),
          atualizado_em = now()
      where idempotency_key = v_key;
  end if;

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values (v_num, v_papel, p_payload->>'chat_id', p_payload->>'origem_message_id',
     p_payload->>'preview_message_id', v_key, v_unidade, v_data, p_payload, 'lancado', null,
     v_mov, v_caixa);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov,
    'caixa_diario_id', v_caixa, 'valor', v_valor, 'forma', v_forma,
    'categoria', v_categoria, 'descricao', v_desc, 'responsavel', v_resp, 'data', v_data);
end $$;

create or replace function public.sol_caixa_lancar_saida(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
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
  v_v3 jsonb;
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

  if v_motivo is null then
    v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload, 'lancar_saida');
    if not coalesce((v_v3->>'ok')::boolean, false) then
      v_motivo := coalesce(v_v3->>'motivo', 'approval_v3_invalido');
    end if;
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
end $$;

revoke all on function public.sol_caixa_lancar_recebimento(jsonb) from public, anon, authenticated;
revoke all on function public.sol_caixa_lancar_saida(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_lancar_recebimento(jsonb) to sol_acesso_restrito, service_role;
grant execute on function public.sol_caixa_lancar_saida(jsonb) to sol_acesso_restrito, service_role;
