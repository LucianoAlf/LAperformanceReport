-- LOTE MULTI-ALUNO: A DESCRIÇÃO PASSA A DIZER DE QUEM É (02/09)
--
-- Relato da Mayra (ADM de CG, 02/09): a Sol confirmou o comprovante no grupo do
-- FINANCEIRO com tudo certo — R$ 640,00 pix, Arthur Da Hora Marinho R$ 320,00 e
-- Daniel Da Hora Marinho R$ 320,00, resp. Angélica — mas no caixa do LA Report
-- as duas linhas saíram como "Parcela 09/2026 do curso de Bateria" e
-- "... de Guitarra", sem nome nenhum. Quem abre o caixa não sabe de quem é.
--
-- A CAUSA é esta expressão, no insert em caixa_movimentacoes:
--
--   coalesce( nullif(v_item->>'descricao',''),                     -- ramo A
--             initcap(categoria)||' - '||(v_item->>'aluno_nome') ) -- ramo B
--
-- O coalesce trata descrição-da-fatura e nome-do-aluno como ALTERNATIVAS. Não
-- são: a descrição diz O QUE foi pago (curso e competência), o nome diz DE QUEM.
-- Como a fatura canônica sempre traz descrição (sol_caixa_validar_multi_aluno_
-- snapshot_v1 devolve 'descricao' = v_fatura->>'descricao'), o ramo A vence
-- sempre e o ramo B — único lugar do lote onde o nome apareceria — é código
-- morto na prática. Medido em 02/09: dos lançamentos de parcela da Sol nos
-- últimos 30 dias, 75/76 avulsos têm nome e 6/6 em lote não têm. 100% de
-- correlação com o caminho, não com o dado.
--
-- O dado NUNCA faltou: no mesmo loop, o mesmo v_item alimenta o insert em
-- sol_caixa_lote_itens_v1, onde aluno_nome é NOT NULL e entra íntegro. Também
-- não é defeito de tela: CaixaMovimentacoesTable.tsx renderiza {mov.descricao}
-- e não tem coluna de aluno — a convenção da casa é o nome ir DENTRO da string,
-- e é o que o caminho avulso faz. O lote é o único produtor que não cumpre.
--
-- O CONSERTO é a mesma regra que sol_caixa_lancar_recebimento já aplica no
-- avulso: montar a descrição em ETAPAS em vez de escolher entre duas. E as
-- guardas `position(...) = 0` não são enfeite — sem elas:
--   · o item declarado pelo humano (sem vínculo de fatura) já traz o nome na
--     descrição e viraria "... - Davi ... - Davi ..." (caso real de 01/09);
--   · aluno que é responsável de si mesmo ganharia "- Bruno · resp. Bruno".
-- Verificado contra os 14 itens de lote existentes: 14/14 no formato do avulso,
-- zero duplicação, zero redundância.
--
-- ⚠️ ESCOPO: isto conserta o FUTURO. As 14 linhas já gravadas seguem pobres —
-- o backfill é escrita em caixa de produção e vai em migration própria, com
-- decisão do negócio. O dado para ele está em sol_caixa_lote_itens_v1.
--
-- Fora a montagem da descrição, esta função é IDÊNTICA à de
-- 20260901231000_snapshot_declarado_entra_no_lote_e_lote_atomico.sql —
-- incluindo a guarda SOL_LOTE_INCOMPLETO, que não foi tocada.

create or replace function public.sol_caixa_lancar_recebimento_lote_v1(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
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
  -- inteira volta e nada fica parcial. Em 01/09 o snapshot omitiu o item
  -- declarado (R$ 1.290 do Davi) e o lote gravou 1 de 2 em silêncio — esta
  -- guarda torna o cenário impossível por construção, não por fé no validador.
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

revoke execute on function public.sol_caixa_lancar_recebimento_lote_v1(jsonb) from public, anon;
