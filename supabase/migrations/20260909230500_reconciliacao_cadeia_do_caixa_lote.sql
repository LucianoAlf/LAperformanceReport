-- ⛔ NÃO APLICADA EM PRODUÇÃO. Reconciliação da cadeia do caixa — parte 2/2.
--
-- Companheira de `20260909230000`. Mesma origem e mesmo método: gerador em SQL
-- lendo, por SELECT-only, o ledger (procedência) e o catálogo vivo (corpo final
-- materializado, ACL, volatility, SECURITY DEFINER, search_path). Nenhum corpo
-- editado.
--
-- Aqui ficam as DUAS funções que a prova de atomicidade exercita — o RPC que
-- grava o lote e o validador que o "pode" revalida. São as maiores da cadeia e
-- por isso ganharam arquivo próprio: migration que ninguém consegue ler não é
-- revisável.
--
-- ⚠️ A pós-condição confere o md5 do corpo INSTALADO contra o hash de produção.
--    Foi ela que provou, na parte 1, que o transporte preservou até o mojibake
--    de `_contrato_tipo_20260817` byte a byte.

\set ON_ERROR_STOP on

-- ═══════════════════════════════════════════════════════════════════════════
-- sol_caixa_validar_multi_aluno_snapshot_v1
-- procedência: ledger 20260901215958 (snapshot_declarado_entra_no_lote_e_lote_atomico)
-- hash do corpo vivo: f4ede61d95baefcf7a08584c68d954c0
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sol_caixa_validar_multi_aluno_snapshot_v1(p_unidade_id uuid, p_itens jsonb, p_valor_total numeric, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_as_of date := coalesce(p_as_of, (now() at time zone 'America/Sao_Paulo')::date);
  v_item jsonb;
  v_env jsonb;
  v_fatura jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_ordem integer := 0;
  v_nome text;
  v_id text;
  v_categoria text;
  v_competencia text;
  v_status_preview text;
  v_valor numeric;
  v_valor_atual numeric;
  v_competencia_fatura text;
  v_soma numeric := 0;
  v_status_env text;
  v_alu record;
begin
  if p_unidade_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'unidade_invalida');
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) < 2 then
    return jsonb_build_object('ok', false, 'motivo', 'multi_aluno_exige_dois_itens');
  end if;
  if p_valor_total is null or p_valor_total <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_total_invalido');
  end if;

  v_env := public.sol_faturas_alunos_v1(
    p_unidade_id,
    extract(year from v_as_of)::int,
    extract(month from v_as_of)::int,
    'janela_3',
    'todas',
    v_as_of
  );
  v_status_env := v_env->>'status';
  if v_status_env is null or v_status_env not in ('ok','partial') then
    return jsonb_build_object('ok', false, 'motivo', 'fonte_indisponivel', 'status_fonte', v_status_env);
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    v_nome := nullif(trim(coalesce(v_item->>'aluno_nome','')), '');
    v_id := nullif(trim(coalesce(v_item->>'canonical_fatura_id','')), '');
    v_categoria := lower(coalesce(nullif(v_item->>'categoria',''), 'parcela'));
    v_competencia := nullif(trim(coalesce(v_item->>'competencia','')), '');
    v_valor := nullif(v_item->>'valor','')::numeric;
    v_status_preview := nullif(v_item->'fatura'->>'status','');

    if v_nome is null or v_valor is null or v_valor <= 0
       or (v_id is null and not coalesce((v_item->>'declarado_pelo_humano')::boolean, false)) then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_item_incompleto', 'ordem', v_ordem);
    end if;

    -- Aluno resolvido para TODO item (declarado incluído): a guarda de primeiro
    -- nome vale igual, e o lote nunca grava item de aluno inexistente/arquivado.
    select a.id, a.nome, a.emusys_student_id, a.responsavel_nome,
           word_similarity(unaccent(lower(v_nome)), unaccent(lower(a.nome_normalizado)))::numeric as sim
      into v_alu
      from public.alunos a
     where a.unidade_id = p_unidade_id
       and a.nome_normalizado is not null
       and (a.status ilike 'ativo%' or a.status is null)
       and public.sol_nome_mesma_pessoa_v1(v_nome, a.nome_normalizado)
     order by word_similarity(unaccent(lower(v_nome)), unaccent(lower(a.nome_normalizado))) desc, a.id
     limit 1;

    if v_alu.id is null or coalesce(v_alu.sim,0) < 0.45 then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_aluno_nao_encontrado', 'ordem', v_ordem);
    end if;

    if v_id is null then
      -- Item declarado pelo humano sem vínculo de fatura (desconto negociado):
      -- não há fatura a revalidar; a soma contra o total segura a aritmética.
      -- O item ENTRA no snapshot devolvido — é sobre este array que a RPC do
      -- lote insere caixa_movimentacoes. O `continue` sem append foi o que
      -- deixou o R$ 1.290 do Davi fora do caixa em 01/09 (aprovado e não gravado).
      v_soma := v_soma + v_valor;
      v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
        'ordem', v_ordem,
        'aluno_nome', v_alu.nome,
        'aluno_id', v_alu.id,
        'responsavel_financeiro', v_alu.responsavel_nome,
        'valor', v_valor,
        'categoria', v_categoria,
        'competencia', v_competencia,
        'canonical_fatura_id', null,
        'sem_vinculo_fatura', true,
        'declarado_pelo_humano', true,
        'descricao', coalesce(nullif(v_item->>'descricao',''),
          initcap(v_categoria) || ' - ' || v_alu.nome || ' · valor declarado, sem vínculo de fatura')
      ));
      continue;
    end if;

    select x into v_fatura
      from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) x
     where x->>'canonical_fatura_id' = v_id
       and x->>'emusys_student_id' = v_alu.emusys_student_id
       and coalesce(x->>'status','') <> 'cancelada'
     limit 1;

    if v_fatura is null then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_fatura_nao_encontrada', 'ordem', v_ordem);
    end if;

    if v_status_preview is not null and v_status_preview <> coalesce(v_fatura->>'status','') then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_status_fatura_mudou', 'ordem', v_ordem);
    end if;

    v_valor_atual := coalesce(
      case when v_fatura->>'status' = 'paga' then nullif(v_fatura->'valores'->>'valor_pago','')::numeric end,
      nullif(v_fatura->'valores'->>'valor_hoje','')::numeric,
      nullif(v_fatura->'valores'->>'valor_com_desconto','')::numeric
    );
    if v_valor_atual is null or abs(v_valor_atual - v_valor) > 0.01 then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_valor_fatura_mudou', 'ordem', v_ordem, 'valor_preview', v_valor, 'valor_atual', v_valor_atual);
    end if;

    if v_categoria in ('passaporte','matricula')
       and coalesce(v_fatura->>'tipo_fatura','') not in ('passaporte_taxa_matricula','matricula') then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_categoria_mudou', 'ordem', v_ordem);
    end if;
    if v_categoria = 'parcela' and coalesce(v_fatura->>'tipo_fatura','') <> 'parcela' then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_categoria_mudou', 'ordem', v_ordem);
    end if;

    v_competencia_fatura := case
      when nullif(v_fatura->>'competencia','') is null then null
      else to_char((v_fatura->>'competencia')::date, 'MM/YYYY')
    end;
    if v_competencia is not null and v_competencia_fatura is not null and v_competencia <> v_competencia_fatura then
      return jsonb_build_object('ok', false, 'motivo', 'snapshot_competencia_mudou', 'ordem', v_ordem);
    end if;

    v_soma := v_soma + v_valor;
    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'ordem', v_ordem,
      'aluno_nome', v_alu.nome,
      'aluno_id', v_alu.id,
      'responsavel_financeiro', v_alu.responsavel_nome,
      'valor', v_valor,
      'categoria', v_categoria,
      'competencia', coalesce(v_competencia_fatura, v_competencia),
      'canonical_fatura_id', v_id,
      'descricao', v_fatura->>'descricao',
      'fatura', jsonb_build_object(
        'canonical_fatura_id', v_id,
        'descricao', v_fatura->>'descricao',
        'tipo_fatura', v_fatura->>'tipo_fatura',
        'competencia', v_fatura->>'competencia',
        'status', v_fatura->>'status',
        'data_pagamento', v_fatura->>'data_pagamento',
        'forma_pagamento', v_fatura->'forma_pagamento',
        'valor_pago', v_fatura->'valores'->>'valor_pago',
        'valor_hoje', v_fatura->'valores'->>'valor_hoje'
      )
    ));
  end loop;

  if abs(v_soma - p_valor_total) > 0.01 then
    return jsonb_build_object('ok', false, 'motivo', 'snapshot_soma_divergente', 'soma_itens', v_soma, 'valor_total', p_valor_total);
  end if;
  -- Invariante do contrato: o snapshot devolve EXATAMENTE um item por item de
  -- entrada — é sobre ele que o lote insere. Se divergir, melhor recusar aqui.
  if jsonb_array_length(v_resultados) <> jsonb_array_length(p_itens) then
    return jsonb_build_object('ok', false, 'motivo', 'snapshot_itens_incompletos',
      'itens_entrada', jsonb_array_length(p_itens), 'itens_snapshot', jsonb_array_length(v_resultados));
  end if;
  return jsonb_build_object('ok', true, 'itens', v_resultados, 'soma_itens', v_soma, 'valor_total', p_valor_total);
end;
$function$
;

revoke all on function public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date) from public, anon, authenticated;
grant execute on function public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date) to service_role, sol_acesso_restrito;

-- ═══════════════════════════════════════════════════════════════════════════
-- sol_caixa_lancar_recebimento_lote_v1
-- procedência: ledger 20260902215535 (lote_descricao_diz_de_quem)
-- hash do corpo vivo: f7141f150b5ac1be2aa306b0b41dec18
-- ═══════════════════════════════════════════════════════════════════════════
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

    insert into public.caixa_movimentacoes(caixa_diario_id,unidade_id,data_movimento,ambiente,tipo,forma_pagamento,categoria,descricao,valor,criado_por,responsavel,cartao_modalidade,cartao_parcelas,aluno_id,fatura_id)
    values(v_caixa,v_unidade,v_data,'venda','entrada',v_forma,v_cat_item,v_desc,(v_item->>'valor')::numeric,concat_ws(':','sol-agente',v_papel,v_num),v_resp,nullif(p_payload->>'cartao_modalidade',''),nullif(p_payload->>'cartao_parcelas','')::int,nullif(v_item->>'aluno_id','')::integer,nullif(v_item->>'canonical_fatura_id','')::uuid)
    returning id into v_mov;
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
$function$
;

revoke all on function public.sol_caixa_lancar_recebimento_lote_v1(jsonb) from public, anon, authenticated;
grant execute on function public.sol_caixa_lancar_recebimento_lote_v1(jsonb) to service_role, sol_acesso_restrito;

-- ═══════════════════════════════════════════════════════════════════════════
-- POS-CONDIÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
do $pos$
declare
  v_falhas text[] := '{}';
  v_sig text; v_esp text; v_obt text; v_i int;
  v_esperado text[][] := array[
    ['public.sol_caixa_lancar_recebimento_lote_v1(jsonb)','f7141f150b5ac1be2aa306b0b41dec18'],
    ['public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date)','f4ede61d95baefcf7a08584c68d954c0']
  ];
begin
  for v_i in 1 .. array_length(v_esperado,1) loop
    v_sig := v_esperado[v_i][1];
    v_esp := v_esperado[v_i][2];

    select md5(replace(substring(pg_get_functiondef(v_sig::regprocedure)
             from position('$function$' in pg_get_functiondef(v_sig::regprocedure))), chr(13), ''))
      into v_obt;

    if v_obt is distinct from v_esp then
      v_falhas := v_falhas || format('%s: corpo %s, esperado %s',
        v_sig, left(coalesce(v_obt,'<nulo>'),12), left(v_esp,12));
    end if;
    if has_function_privilege('anon', v_sig, 'EXECUTE') then
      v_falhas := v_falhas || format('%s: executavel por anon', v_sig);
    end if;
    if has_function_privilege('authenticated', v_sig, 'EXECUTE') then
      v_falhas := v_falhas || format('%s: executavel por authenticated', v_sig);
    end if;
    if not has_function_privilege('service_role', v_sig, 'EXECUTE') then
      v_falhas := v_falhas || format('%s: service_role SEM execute', v_sig);
    end if;
  end loop;

  -- a invariante que a atomicidade depende tem de estar presente NO CORPO
  if pg_get_functiondef('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure)
       not like '%SOL_LOTE_INCOMPLETO%' then
    v_falhas := v_falhas || 'lote: a invariante SOL_LOTE_INCOMPLETO sumiu do corpo';
  end if;
  if (select prosecdef from pg_proc where oid =
       'public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure) is not true then
    v_falhas := v_falhas || 'lote: deveria ser SECURITY DEFINER';
  end if;
  if (select provolatile from pg_proc where oid =
       'public.sol_caixa_validar_multi_aluno_snapshot_v1(uuid,jsonb,numeric,date)'::regprocedure) <> 's' then
    v_falhas := v_falhas || 'snapshot: deveria ser STABLE';
  end if;

  if array_length(v_falhas,1) > 0 then
    raise exception E'RECONCILIACAO NAO FECHOU:\n  %', array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'reconciliacao 2/2 ok: lote + snapshot, corpo + ACL + atributos conferidos';
end $pos$;
