-- Campos de cheque pedidos pelo Super Folha (handoff 06/10/2026): emitente
-- (nome impresso no rodapé), hash do documento do emitente e agência/conta
-- extraídos do CMC-7 validado pela Sol. Hoje a leitura é efêmera — usada no
-- resolver e descartada. Estas colunas passam a persistir o que a Sol mandar;
-- até lá ficam NULL e nada muda no fluxo.
--
-- Documento NUNCA em claro: a RPC só aceita HMAC-SHA256 em hex (64 chars), o
-- mesmo que sol_cheque_documento_hash_v1 já produz com a chave do Vault.

alter table public.caixa_movimentacoes
  add column if not exists cheque_emitente_nome text,
  add column if not exists cheque_emitente_documento_hash text,
  add column if not exists cheque_agencia text,
  add column if not exists cheque_conta text;

comment on column public.caixa_movimentacoes.cheque_emitente_nome is
  'Nome IMPRESSO no rodapé do cheque (emitente), lido e provado pela Sol. Não confundir com beneficiário (nome à mão) nem responsável financeiro.';
comment on column public.caixa_movimentacoes.cheque_emitente_documento_hash is
  'HMAC-SHA256 (hex) do CPF/CNPJ do emitente — sol_cheque_documento_hash_v1. Documento em claro nunca é gravado.';
comment on column public.caixa_movimentacoes.cheque_agencia is
  'Agência extraída do CMC-7 validado (banco+agência conferidos com o impresso).';
comment on column public.caixa_movimentacoes.cheque_conta is
  'Conta do emitente extraída do CMC-7 validado (campo 3, com DV).';

-- ---------------------------------------------------------------------------
-- sol_caixa_lancar_recebimento (lançamento simples): campos no nível do payload.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sol_caixa_lancar_recebimento(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_aluno_id integer := nullif(p_payload->>'aluno_id','')::integer;
  v_fatura_id uuid := nullif(p_payload->>'fatura_id','')::uuid;
  v_fatura_ids uuid[] := case
    when jsonb_typeof(p_payload->'fatura_ids') = 'array'
      then (select array_agg(x::uuid) from jsonb_array_elements_text(p_payload->'fatura_ids') x)
    else null end;
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

  if v_aluno_id is not null and not exists (
    select 1 from public.alunos a where a.id = v_aluno_id and a.unidade_id = v_unidade
  ) then v_aluno_id := null; end if;
  if v_fatura_ids is not null then
    v_fatura_ids := (
      select array_agg(f.id) from public.emusys_faturas f
      where f.id = any(v_fatura_ids) and f.unidade_id = v_unidade
    );
    if v_fatura_ids is not null and array_length(v_fatura_ids, 1) = 1 then
      v_fatura_id := coalesce(v_fatura_id, v_fatura_ids[1]);
      v_fatura_ids := null;
    elsif v_fatura_ids is not null then
      v_fatura_id := null;
    end if;
  end if;
  if v_fatura_id is not null and not exists (
    select 1 from public.emusys_faturas f where f.id = v_fatura_id and f.unidade_id = v_unidade
  ) then v_fatura_id := null; end if;

  insert into public.caixa_movimentacoes
    (caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
     forma_pagamento, categoria, descricao, valor, criado_por, responsavel,
     cartao_modalidade, cartao_parcelas, aluno_id, fatura_id,
     cheque_numero, cheque_banco, cheque_bom_para,
     cheque_emitente_nome, cheque_emitente_documento_hash,
     cheque_agencia, cheque_conta)
  values
    (v_caixa, v_unidade, v_data, 'venda', 'entrada',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp, v_modal, v_parc, v_aluno_id, v_fatura_id,
     nullif(trim(p_payload->>'cheque_numero'),''),
     nullif(trim(p_payload->>'cheque_banco'),''),
     case when p_payload->>'cheque_bom_para' ~ '^\d{4}-\d{2}-\d{2}$' then (p_payload->>'cheque_bom_para')::date end,
     nullif(trim(p_payload->>'cheque_emitente_nome'),''),
     case when p_payload->>'cheque_emitente_documento_hash' ~ '^[0-9a-fA-F]{64}$'
          then lower(p_payload->>'cheque_emitente_documento_hash') end,
     nullif(trim(p_payload->>'cheque_agencia'),''),
     nullif(trim(p_payload->>'cheque_conta'),''))
  returning id into v_mov;

  if v_fatura_ids is not null then
    insert into public.caixa_movimentacao_faturas (movimentacao_id, fatura_id, unidade_id)
    select v_mov, x, v_unidade from unnest(v_fatura_ids) x
    on conflict do nothing;
  end if;

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
end $function$;

-- ---------------------------------------------------------------------------
-- sol_caixa_lancar_recebimento_lote_v1: campos por ITEM (itens[ordem-1]),
-- mesmo lugar de onde já saem cheque_numero/cheque_banco/cheque_bom_para.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sol_caixa_lancar_recebimento_lote_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_unidade uuid := nullif(p_payload->>'unidade_id','')::uuid;
  v_data date := coalesce(nullif(p_payload->>'data','')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_total numeric := nullif(p_payload->>'valor','')::numeric;
  v_forma text := lower(coalesce(p_payload->>'forma',''));
  v_categoria text := lower(coalesce(nullif(p_payload->>'categoria',''),'parcela'));
  v_num text := regexp_replace(coalesce(p_payload->>'ator_numero',''),'\D','','g');
  v_papel text := p_payload->>'ator_papel';
  v_key text := nullif(p_payload->>'idempotency_key','');
  v_caixa uuid;
  v_lote uuid;
  v_preview public.sol_caixa_shadow_previews_v1%rowtype;
  v_v3 jsonb;
  v_snapshot jsonb;
  v_item jsonb;
  v_mov uuid;
  v_movs jsonb := '[]'::jsonb;
  v_ordem integer := 0;
  v_soma_ins numeric := 0;
  v_resp text;
  v_motivo text;
  -- (02/09) montagem da descrição por item
  v_cat_item text;
  v_nome text;
  v_respfin text;
  v_desc text;
begin
  if v_key is null then
    return jsonb_build_object('ok', false, 'motivo', 'idempotency_key_obrigatoria');
  end if;

  select id into v_lote from public.sol_caixa_lotes_v1 where idempotency_key = v_key;
  if v_lote is not null then
    select coalesce(jsonb_agg(jsonb_build_object('movimentacao_id',movimentacao_id,'aluno_nome',aluno_nome,'valor',valor) order by ordem),'[]'::jsonb)
      into v_movs from public.sol_caixa_lote_itens_v1 where lote_id = v_lote;
    return jsonb_build_object('ok', true, 'ja_lancado', true, 'lote_id', v_lote, 'movimentacoes', v_movs);
  end if;

  if v_unidade is null then v_motivo := 'unidade_invalida';
  elsif v_total is null or v_total <= 0 then v_motivo := 'valor_invalido';
  elsif v_forma not in ('dinheiro','pix','cartao','cheque','transferencia','outro') then v_motivo := 'forma_invalida';
  elsif jsonb_typeof(p_payload->'itens') is distinct from 'array' or jsonb_array_length(p_payload->'itens') < 2 then v_motivo := 'multi_aluno_exige_dois_itens';
  end if;

  if v_motivo is null then
    select id into v_caixa from public.caixas_diarios where unidade_id=v_unidade and data_caixa=v_data and status='aberto' order by aberto_em desc limit 1;
    if v_caixa is null then v_motivo := 'caixa_nao_aberto'; end if;
  end if;

  if v_motivo is null then
    select * into v_preview from public.sol_caixa_shadow_previews_v1 where id=nullif(p_payload->>'v3_preview_id','')::uuid for update;
    if v_preview.id is null then v_motivo := 'preview_v3_nao_encontrado';
    elsif coalesce(v_preview.preview_json #>> '{pending,tipoOperacao}','') <> 'lancar_recebimento_lote' then v_motivo := 'preview_nao_e_lote_multi_aluno';
    elsif coalesce(v_preview.preview_json #> '{pending,itens}','null'::jsonb) is distinct from coalesce(p_payload->'itens','null'::jsonb) then v_motivo := 'itens_divergentes_do_preview_v3';
    end if;
  end if;

  if v_motivo is null then
    -- Valida o snapshot do preview; não faz nova seleção de fatura.
    v_snapshot := public.sol_caixa_validar_multi_aluno_snapshot_v1(v_unidade, p_payload->'itens', v_total, v_data);
    if not coalesce((v_snapshot->>'ok')::boolean,false) then
      v_motivo := coalesce(v_snapshot->>'motivo','snapshot_nao_validado');
    end if;
  end if;

  if v_motivo is null then
    v_v3 := public.sol_caixa_v3_validar_approval_v1(p_payload,'lancar_recebimento');
    if not coalesce((v_v3->>'ok')::boolean,false) then v_motivo := coalesce(v_v3->>'motivo','approval_v3_invalido'); end if;
  end if;

  if v_motivo is not null then
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,origem_message_id,preview_message_id,idempotency_key,unidade_id,data_caixa,payload,resultado,motivo)
    values(v_num,v_papel,p_payload->>'chat_id',p_payload->>'origem_message_id',p_payload->>'preview_message_id',v_key,v_unidade,v_data,p_payload,'recusado',v_motivo);
    return jsonb_build_object('ok',false,'motivo',v_motivo);
  end if;

  insert into public.sol_caixa_lotes_v1(unidade_id,caixa_diario_id,preview_id,approval_id,idempotency_key,valor_total,forma_pagamento,categoria,ator_numero,payload)
  values(v_unidade,v_caixa,nullif(p_payload->>'v3_preview_id','')::uuid,nullif(p_payload->>'v3_approval_id','')::uuid,v_key,v_total,v_forma,v_categoria,v_num,p_payload)
  returning id into v_lote;
  v_resp := coalesce(nullif(p_payload->>'autorizado_por',''),'Sol (agente)') || ' · via Sol';

  for v_item in select value from jsonb_array_elements(v_snapshot->'itens') loop
    v_ordem := v_ordem + 1;

    -- DESCRIÇÃO EM ETAPAS (02/09), espelhando sol_caixa_lancar_recebimento.
    -- A descrição da fatura e a identificação da pessoa são COMPLEMENTARES:
    -- a primeira entra como base, as outras duas se somam a ela. Cada anexo é
    -- condicionado a não estar já contido no texto — é o que impede
    -- "- Davi ... - Davi" no item declarado e "- Bruno · resp. Bruno" em quem
    -- é responsável de si mesmo.
    v_cat_item := coalesce(v_item->>'categoria', v_categoria);
    v_nome     := nullif(trim(coalesce(v_item->>'aluno_nome','')),'');
    v_respfin  := nullif(trim(coalesce(v_item->>'responsavel_financeiro','')),'');
    v_desc     := nullif(trim(coalesce(v_item->>'descricao','')),'');

    if v_desc is null then
      v_desc := trim(concat_ws(' ', initcap(v_cat_item),
                               case when v_nome is not null then '- '||v_nome end));
    end if;
    if v_nome is not null and position(lower(v_nome) in lower(v_desc)) = 0 then
      v_desc := v_desc || ' - ' || v_nome;
    end if;
    if v_respfin is not null and position(lower(v_respfin) in lower(v_desc)) = 0 then
      v_desc := v_desc || ' · resp. ' || v_respfin;
    end if;
    if v_desc is null or length(v_desc) < 3 then
      v_desc := 'Recebimento via Sol';
    end if;
    -- complemento que só a ENTRADA conhece (ex.: "cheque Santander nº 000212").
    if nullif(trim(coalesce(p_payload->'itens'->(v_ordem - 1)->>'complemento_descricao','')),'') is not null then
      v_desc := v_desc || ' · ' || left(trim(p_payload->'itens'->(v_ordem - 1)->>'complemento_descricao'), 80);
    end if;

    insert into public.caixa_movimentacoes(caixa_diario_id,unidade_id,data_movimento,ambiente,tipo,forma_pagamento,categoria,descricao,valor,criado_por,responsavel,cartao_modalidade,cartao_parcelas,aluno_id,fatura_id,cheque_numero,cheque_banco,cheque_bom_para,cheque_emitente_nome,cheque_emitente_documento_hash,cheque_agencia,cheque_conta)
    values(v_caixa,v_unidade,v_data,'venda','entrada',v_forma,v_cat_item,v_desc,(v_item->>'valor')::numeric,concat_ws(':','sol-agente',v_papel,v_num),v_resp,nullif(p_payload->>'cartao_modalidade',''),nullif(p_payload->>'cartao_parcelas','')::int,nullif(v_item->>'aluno_id','')::integer,case when jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') > 1 then null else nullif(v_item->>'canonical_fatura_id','')::uuid end,
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_numero'),''),
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_banco'),''),
    case when p_payload->'itens'->(v_ordem - 1)->>'cheque_bom_para' ~ '^\d{4}-\d{2}-\d{2}$'
         then (p_payload->'itens'->(v_ordem - 1)->>'cheque_bom_para')::date end,
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_emitente_nome'),''),
    case when p_payload->'itens'->(v_ordem - 1)->>'cheque_emitente_documento_hash' ~ '^[0-9a-fA-F]{64}$'
         then lower(p_payload->'itens'->(v_ordem - 1)->>'cheque_emitente_documento_hash') end,
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_agencia'),''),
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_conta'),''))
    returning id into v_mov;
    if jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') > 0 then
      insert into public.caixa_movimentacao_faturas (movimentacao_id, fatura_id, unidade_id)
      select v_mov, x::uuid, v_unidade
        from jsonb_array_elements_text(v_item->'fatura_ids') x
        join public.emusys_faturas f on f.id = x::uuid and f.unidade_id = v_unidade
      on conflict do nothing;
    end if;
    v_soma_ins := v_soma_ins + (v_item->>'valor')::numeric;
    insert into public.sol_caixa_lote_itens_v1(lote_id,ordem,aluno_nome,responsavel_financeiro,competencia,categoria,valor,canonical_fatura_id,movimentacao_id,item_json)
    values(v_lote,v_ordem,v_item->>'aluno_nome',nullif(v_item->>'responsavel_financeiro',''),nullif(v_item->>'competencia',''),v_item->>'categoria',(v_item->>'valor')::numeric,nullif(v_item->>'canonical_fatura_id',''),v_mov,v_item);
    insert into public.sol_caixa_lancamento_auditoria(ator_numero,ator_papel,chat_id,origem_message_id,preview_message_id,idempotency_key,unidade_id,data_caixa,payload,resultado,motivo,movimentacao_id,caixa_diario_id)
    values(v_num,v_papel,p_payload->>'chat_id',p_payload->>'origem_message_id',p_payload->>'preview_message_id',v_key||':'||v_ordem,v_unidade,v_data,p_payload||jsonb_build_object('item_lote',v_item),'lancado_lote',null,v_mov,v_caixa);
    v_movs := v_movs || jsonb_build_array(jsonb_build_object('movimentacao_id',v_mov,'aluno_nome',v_item->>'aluno_nome','valor',(v_item->>'valor')::numeric));
  end loop;

  -- INVARIANTE DO LOTE (01/09): o que foi gravado tem de ser EXATAMENTE o que
  -- foi aprovado — mesmo nº de itens e mesma soma. Divergiu, RAISE: a transação
  -- inteira volta e nada fica parcial.
  if v_ordem <> jsonb_array_length(p_payload->'itens') or abs(v_soma_ins - v_total) > 0.01 then
    raise exception 'SOL_LOTE_INCOMPLETO: gravados % de % itens, soma % vs total %',
      v_ordem, jsonb_array_length(p_payload->'itens'), v_soma_ins, v_total;
  end if;

  update public.sol_caixa_ingestao_recebimentos
     set status='lancado', movimentacao_id=(v_movs->0->>'movimentacao_id')::uuid, lancado_em=now(), lancado_por=v_num, valor_extraido=v_total, forma_extraida=v_forma, categoria_extraida=v_categoria, preview_message_id=coalesce(preview_message_id,p_payload->>'preview_message_id'), atualizado_em=now()
   where idempotency_key=v_key;
  return jsonb_build_object('ok',true,'lote_id',v_lote,'valor',v_total,'forma',v_forma,'movimentacoes',v_movs);
end;
$function$;

revoke all on function public.sol_caixa_lancar_recebimento(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_lancar_recebimento(jsonb) to service_role;
revoke all on function public.sol_caixa_lancar_recebimento_lote_v1(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_lancar_recebimento_lote_v1(jsonb) to service_role;
