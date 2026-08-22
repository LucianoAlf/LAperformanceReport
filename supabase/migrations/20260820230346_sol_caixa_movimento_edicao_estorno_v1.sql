-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

create table if not exists public.sol_caixa_operacoes_auditoria_v1 (
  id uuid primary key default gen_random_uuid(),
  operacao text not null,
  idempotency_key text,
  unidade_id uuid,
  caixa_diario_id uuid,
  movimentacao_id uuid,
  movimentacao_estorno_id uuid,
  ator_numero_hash text,
  ator_numero_tail text,
  ator_papel text,
  grupo_jid_hash text,
  chat_id_hash text,
  origem_message_id text,
  preview_message_id text,
  motivo text,
  payload jsonb not null default '{}'::jsonb,
  antes jsonb,
  depois jsonb,
  resultado text not null,
  erro text,
  criado_em timestamptz not null default now()
);

create unique index if not exists sol_caixa_operacoes_auditoria_v1_idem_uniq
  on public.sol_caixa_operacoes_auditoria_v1 (idempotency_key)
  where idempotency_key is not null;

create index if not exists sol_caixa_operacoes_auditoria_v1_mov_idx
  on public.sol_caixa_operacoes_auditoria_v1 (movimentacao_id, criado_em desc);

create or replace function public.sol_caixa_recalcular_cofre(p_caixa_diario_id uuid)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_saldo numeric;
begin
  if p_caixa_diario_id is null then
    return null;
  end if;

  select coalesce(c.saldo_inicial_cofre, 0)
       + coalesce((select sum(m.valor) from public.caixa_movimentacoes m where m.caixa_diario_id = p_caixa_diario_id and m.ambiente = 'cofre' and m.tipo = 'entrada'), 0)
       - coalesce((select sum(m.valor) from public.caixa_movimentacoes m where m.caixa_diario_id = p_caixa_diario_id and m.ambiente = 'cofre' and m.tipo = 'saida'), 0)
    into v_saldo
  from public.caixas_diarios c
  where c.id = p_caixa_diario_id;

  if v_saldo is not null then
    update public.caixas_diarios
       set saldo_final_calculado = v_saldo,
           updated_at = now()
     where id = p_caixa_diario_id;
  end if;

  return v_saldo;
end;
$$;

create or replace function public.sol_caixa_autorizar_payload_v1(p_unidade uuid, p_payload jsonb, p_operacao text default 'preview')
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_grupo text := coalesce(nullif(p_payload->>'grupo_jid',''), nullif(p_payload->>'chat_id',''));
  v_grupo_ok jsonb;
  v_ator_ok jsonb;
begin
  if p_unidade is null then
    return jsonb_build_object('ok', false, 'autorizado', false, 'motivo', 'unidade_obrigatoria');
  end if;

  if v_grupo is not null and v_grupo like '%@g.us' then
    v_grupo_ok := public.sol_caixa_grupo_operacao_ok(p_unidade, v_grupo, p_operacao);
    if coalesce((v_grupo_ok->>'autorizado')::boolean, false) then
      return v_grupo_ok || jsonb_build_object('origem_autorizacao', 'grupo_financeiro_oficial');
    end if;
  end if;

  v_ator_ok := public.sol_caixa_ator_operacao_ok(p_unidade, v_num, p_operacao);
  if coalesce((v_ator_ok->>'autorizado')::boolean, false) then
    return v_ator_ok || jsonb_build_object('origem_autorizacao', 'matriz_ou_policy');
  end if;

  return jsonb_build_object(
    'ok', true,
    'autorizado', false,
    'motivo', coalesce(v_grupo_ok->>'motivo', v_ator_ok->>'motivo', 'nao_autorizado'),
    'operacao', p_operacao
  );
end;
$$;

create or replace function public.sol_caixa_buscar_movimentos_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data_ini date := coalesce(nullif(p_payload->>'data_inicio','')::date, ((now() at time zone 'America/Sao_Paulo')::date - 1));
  v_data_fim date := coalesce(nullif(p_payload->>'data_fim','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := nullif(p_payload->>'valor','')::numeric;
  v_categoria text := nullif(lower(coalesce(p_payload->>'categoria','')), '');
  v_forma text := nullif(lower(coalesce(p_payload->>'forma','')), '');
  v_texto text := nullif(lower(coalesce(p_payload->>'texto','')), '');
  v_aut jsonb;
  v_items jsonb;
begin
  if v_unidade is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_obrigatoria');
  end if;

  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'consulta_caixa');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'movimentacao_id', cm.id,
    'caixa_diario_id', cm.caixa_diario_id,
    'unidade_id', cm.unidade_id,
    'data_movimento', cm.data_movimento,
    'ambiente', cm.ambiente,
    'tipo', cm.tipo,
    'forma_pagamento', cm.forma_pagamento,
    'cartao_modalidade', cm.cartao_modalidade,
    'cartao_parcelas', cm.cartao_parcelas,
    'categoria', cm.categoria,
    'descricao', cm.descricao,
    'valor', cm.valor,
    'responsavel', cm.responsavel,
    'criado_por', cm.criado_por,
    'created_at', cm.created_at
  ) order by cm.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select *
    from public.caixa_movimentacoes cm
    where cm.unidade_id = v_unidade
      and cm.data_movimento between v_data_ini and v_data_fim
      and (v_valor is null or abs(cm.valor - v_valor) < 0.01)
      and (v_categoria is null or cm.categoria = v_categoria)
      and (v_forma is null or cm.forma_pagamento = v_forma)
      and (v_texto is null or lower(cm.descricao) like '%' || v_texto || '%' or lower(coalesce(cm.responsavel,'')) like '%' || v_texto || '%')
    order by cm.created_at desc
    limit 10
  ) cm;

  return jsonb_build_object('ok', true, 'items', v_items, 'count', jsonb_array_length(v_items));
end;
$$;

create or replace function public.sol_caixa_corrigir_movimento_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mov_id uuid := nullif(p_payload->>'movimentacao_id','')::uuid;
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_motivo text := nullif(trim(coalesce(p_payload->>'motivo','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_chat text := p_payload->>'chat_id';
  v_grupo text := coalesce(nullif(p_payload->>'grupo_jid',''), nullif(p_payload->>'chat_id',''));
  v_corr jsonb := coalesce(p_payload->'correcoes', '{}'::jsonb);
  v_m public.caixa_movimentacoes%rowtype;
  v_caixa public.caixas_diarios%rowtype;
  v_aut jsonb;
  v_forma text;
  v_modal text;
  v_parc int;
  v_categoria text;
  v_desc text;
  v_resp text;
  v_valor numeric;
  v_antes jsonb;
  v_depois jsonb;
  v_saldo numeric;
  v_prev record;
begin
  if v_key is not null then
    select * into v_prev
    from public.sol_caixa_operacoes_auditoria_v1
    where idempotency_key = v_key
    limit 1;
    if v_prev.id is not null then
      return jsonb_build_object('ok', v_prev.resultado = 'corrigido', 'ja_processado', true, 'resultado', v_prev.resultado, 'movimentacao_id', v_prev.movimentacao_id, 'auditoria_id', v_prev.id);
    end if;
  end if;

  if v_mov_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'movimentacao_obrigatoria');
  end if;

  select * into v_m from public.caixa_movimentacoes where id = v_mov_id for update;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'movimentacao_nao_encontrada');
  end if;

  v_unidade := coalesce(v_unidade, v_m.unidade_id);
  if v_m.unidade_id is distinct from v_unidade then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_divergente');
  end if;

  select * into v_caixa from public.caixas_diarios where id = v_m.caixa_diario_id for update;
  if v_caixa.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_nao_encontrado');
  elsif v_caixa.status <> 'aberto' then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_fechado');
  elsif v_m.data_movimento < ((now() at time zone 'America/Sao_Paulo')::date - 1) then
    return jsonb_build_object('ok', false, 'motivo', 'fora_da_janela_operacional');
  end if;

  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'corrigir_movimento');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  v_forma := coalesce(nullif(lower(v_corr->>'forma_pagamento'), ''), nullif(lower(v_corr->>'forma'), ''), v_m.forma_pagamento);
  v_modal := case when v_corr ? 'cartao_modalidade' then nullif(lower(v_corr->>'cartao_modalidade'), '') else v_m.cartao_modalidade end;
  v_parc := case when v_corr ? 'cartao_parcelas' then nullif(v_corr->>'cartao_parcelas', '')::int else v_m.cartao_parcelas end;
  v_categoria := coalesce(nullif(lower(v_corr->>'categoria'), ''), v_m.categoria);
  v_desc := coalesce(nullif(trim(v_corr->>'descricao'), ''), v_m.descricao);
  v_resp := case when v_corr ? 'responsavel' then nullif(trim(v_corr->>'responsavel'), '') else v_m.responsavel end;
  v_valor := coalesce(nullif(v_corr->>'valor', '')::numeric, v_m.valor);

  if v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then
    return jsonb_build_object('ok', false, 'motivo', 'forma_invalida');
  end if;
  if v_forma <> 'cartao' then
    v_modal := null;
    v_parc := null;
  elsif v_modal is not null and v_modal not in ('debito','credito') then
    return jsonb_build_object('ok', false, 'motivo', 'cartao_modalidade_invalida');
  elsif v_parc is not null and (v_modal <> 'credito' or v_parc < 1) then
    return jsonb_build_object('ok', false, 'motivo', 'cartao_parcelas_invalidas');
  end if;

  if v_m.ambiente = 'cofre' and v_forma <> 'dinheiro' then
    return jsonb_build_object('ok', false, 'motivo', 'cofre_somente_dinheiro');
  end if;
  if v_categoria !~ '^[a-z0-9_-]+$' or length(trim(v_categoria)) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'categoria_invalida');
  end if;
  if v_desc is null or length(trim(v_desc)) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'descricao_invalida');
  end if;
  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_invalido');
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio');
  end if;

  v_antes := to_jsonb(v_m);

  update public.caixa_movimentacoes
     set forma_pagamento = v_forma,
         cartao_modalidade = case when v_forma = 'cartao' then v_modal else null end,
         cartao_parcelas = case when v_forma = 'cartao' then v_parc else null end,
         categoria = v_categoria,
         descricao = v_desc,
         responsavel = v_resp,
         valor = v_valor,
         updated_at = now()
   where id = v_mov_id
   returning to_jsonb(public.caixa_movimentacoes.*) into v_depois;

  if v_m.ambiente = 'cofre' then
    v_saldo := public.sol_caixa_recalcular_cofre(v_m.caixa_diario_id);
  end if;

  insert into public.sol_caixa_operacoes_auditoria_v1
    (operacao, idempotency_key, unidade_id, caixa_diario_id, movimentacao_id,
     ator_numero_hash, ator_numero_tail, ator_papel, grupo_jid_hash, chat_id_hash,
     origem_message_id, preview_message_id, motivo, payload, antes, depois, resultado)
  values
    ('corrigir_movimento', v_key, v_unidade, v_m.caixa_diario_id, v_mov_id,
     case when v_num <> '' then md5(v_num) end, right(v_num, 4), v_papel,
     case when v_grupo is not null then md5(v_grupo) end,
     case when v_chat is not null then md5(v_chat) end,
     p_payload->>'origem_message_id', p_payload->>'preview_message_id', v_motivo,
     p_payload, v_antes, v_depois, 'corrigido');

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values
    (v_num, v_papel, v_chat, p_payload->>'origem_message_id', p_payload->>'preview_message_id',
     v_key, v_unidade, v_m.data_movimento, p_payload || jsonb_build_object('antes', v_antes, 'depois', v_depois),
     'movimento_corrigido', v_motivo, v_mov_id, v_m.caixa_diario_id);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov_id, 'antes', v_antes, 'depois', v_depois, 'saldo_final', v_saldo);
end;
$$;

create or replace function public.sol_caixa_estornar_movimento_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mov_id uuid := nullif(p_payload->>'movimentacao_id','')::uuid;
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_motivo text := nullif(trim(coalesce(p_payload->>'motivo','')),'');
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_chat text := p_payload->>'chat_id';
  v_grupo text := coalesce(nullif(p_payload->>'grupo_jid',''), nullif(p_payload->>'chat_id',''));
  v_m public.caixa_movimentacoes%rowtype;
  v_caixa public.caixas_diarios%rowtype;
  v_aut jsonb;
  v_estorno_id uuid;
  v_tipo_estorno text;
  v_desc text;
  v_resp text;
  v_antes jsonb;
  v_depois jsonb;
  v_saldo numeric;
  v_prev record;
begin
  if v_key is not null then
    select * into v_prev
    from public.sol_caixa_operacoes_auditoria_v1
    where idempotency_key = v_key
    limit 1;
    if v_prev.id is not null then
      return jsonb_build_object('ok', v_prev.resultado = 'estornado', 'ja_processado', true, 'resultado', v_prev.resultado, 'movimentacao_id', v_prev.movimentacao_id, 'movimentacao_estorno_id', v_prev.movimentacao_estorno_id, 'auditoria_id', v_prev.id);
    end if;
  end if;

  if v_mov_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'movimentacao_obrigatoria');
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'motivo', 'motivo_obrigatorio');
  end if;

  select * into v_m from public.caixa_movimentacoes where id = v_mov_id for update;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'movimentacao_nao_encontrada');
  end if;

  v_unidade := coalesce(v_unidade, v_m.unidade_id);
  if v_m.unidade_id is distinct from v_unidade then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_divergente');
  end if;

  select * into v_caixa from public.caixas_diarios where id = v_m.caixa_diario_id for update;
  if v_caixa.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_nao_encontrado');
  elsif v_caixa.status <> 'aberto' then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_fechado');
  elsif v_m.data_movimento < ((now() at time zone 'America/Sao_Paulo')::date - 1) then
    return jsonb_build_object('ok', false, 'motivo', 'fora_da_janela_operacional');
  elsif v_m.descricao ilike 'ESTORNO de %' then
    return jsonb_build_object('ok', false, 'motivo', 'estorno_nao_estornavel');
  end if;

  if exists (
    select 1 from public.sol_caixa_operacoes_auditoria_v1 a
    where a.operacao = 'estornar_movimento'
      and a.movimentacao_id = v_mov_id
      and a.resultado = 'estornado'
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'movimentacao_ja_estornada');
  end if;

  v_aut := public.sol_caixa_autorizar_payload_v1(v_unidade, p_payload, 'estornar_movimento');
  if not coalesce((v_aut->>'autorizado')::boolean, false) then
    return jsonb_build_object('ok', false, 'motivo', 'ator_nao_autorizado', 'auth', v_aut);
  end if;

  v_tipo_estorno := case when v_m.tipo = 'entrada' then 'saida' else 'entrada' end;
  v_desc := left('ESTORNO de ' || v_m.id::text || ' - ' || v_m.descricao || ' - Motivo: ' || v_motivo, 500);
  v_resp := coalesce(nullif(trim(p_payload->>'autorizado_por'), ''), nullif(trim(p_payload->>'enviado_por'), ''), 'Sol (agente)') || ' · via Sol · estorno';
  v_antes := to_jsonb(v_m);

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, responsavel, criado_por,
     cartao_modalidade, cartao_parcelas, link_pagamento)
  values
    (v_m.caixa_diario_id, v_m.unidade_id, v_m.data_movimento, v_m.ambiente, v_tipo_estorno,
     v_m.forma_pagamento, 'estorno', v_desc, v_m.valor, v_resp,
     concat_ws(':', 'sol-agente', 'estorno', v_papel, v_num),
     v_m.cartao_modalidade, v_m.cartao_parcelas, v_m.link_pagamento)
  returning id into v_estorno_id;

  select to_jsonb(cm.*) into v_depois from public.caixa_movimentacoes cm where cm.id = v_estorno_id;

  if v_m.ambiente = 'cofre' then
    v_saldo := public.sol_caixa_recalcular_cofre(v_m.caixa_diario_id);
  end if;

  insert into public.sol_caixa_operacoes_auditoria_v1
    (operacao, idempotency_key, unidade_id, caixa_diario_id, movimentacao_id, movimentacao_estorno_id,
     ator_numero_hash, ator_numero_tail, ator_papel, grupo_jid_hash, chat_id_hash,
     origem_message_id, preview_message_id, motivo, payload, antes, depois, resultado)
  values
    ('estornar_movimento', v_key, v_unidade, v_m.caixa_diario_id, v_mov_id, v_estorno_id,
     case when v_num <> '' then md5(v_num) end, right(v_num, 4), v_papel,
     case when v_grupo is not null then md5(v_grupo) end,
     case when v_chat is not null then md5(v_chat) end,
     p_payload->>'origem_message_id', p_payload->>'preview_message_id', v_motivo,
     p_payload, v_antes, v_depois, 'estornado');

  insert into public.sol_caixa_lancamento_auditoria
    (ator_numero, ator_papel, chat_id, origem_message_id, preview_message_id,
     idempotency_key, unidade_id, data_caixa, payload, resultado, motivo,
     movimentacao_id, caixa_diario_id)
  values
    (v_num, v_papel, v_chat, p_payload->>'origem_message_id', p_payload->>'preview_message_id',
     v_key, v_unidade, v_m.data_movimento, p_payload || jsonb_build_object('movimento_original', v_antes, 'movimento_estorno', v_depois),
     'movimento_estornado', v_motivo, v_mov_id, v_m.caixa_diario_id);

  return jsonb_build_object('ok', true, 'movimentacao_id', v_mov_id, 'movimentacao_estorno_id', v_estorno_id, 'tipo_estorno', v_tipo_estorno, 'valor', v_m.valor, 'saldo_final', v_saldo);
end;
$$;

revoke all on function public.sol_caixa_recalcular_cofre(uuid) from public;
revoke all on function public.sol_caixa_autorizar_payload_v1(uuid, jsonb, text) from public;
revoke all on function public.sol_caixa_buscar_movimentos_v1(jsonb) from public;
revoke all on function public.sol_caixa_corrigir_movimento_v1(jsonb) from public;
revoke all on function public.sol_caixa_estornar_movimento_v1(jsonb) from public;

grant execute on function public.sol_caixa_buscar_movimentos_v1(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_corrigir_movimento_v1(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_estornar_movimento_v1(jsonb) to sol_acesso_restrito;
