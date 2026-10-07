-- Caixa: numero/banco/bom-para do cheque como COLUNAS, nao mais so no texto (27/09/2026)
--
-- Pedido do Super Folha aprovado pelo Alf em 26/09 (handoff
-- 2026-09-27-pedido-la-report-fim-matricula-e-cheque-no-caixa.md, §2): o SF liga
-- o cheque ao deposito do banco pelo NUMERO, que hoje sai do texto da descricao
-- ("· cheque Santander nº 000212") — funciona, mas qualquer mudanca no texto
-- quebra a ligacao sem aviso. Passa a existir campo estruturado por movimento.
--
-- Fonte dos valores: a ENTRADA do lancamento (o item que a Sol monta ao ler o
-- PDF), mesmo lugar de complemento_descricao — o validador nao conhece numero
-- de cheque. Sem os campos, comportamento identico (lotes de Pix intactos).
-- Nao muda o recebimento no Emusys: a unidade ja lanca; isto so enriquece a
-- movimentacao do caixa da Sol.
--
-- Colunas ficam NULL fora de cheque — export emite null e o SF usa a descricao
-- como fallback ate a Sol passar a enviar os campos.

alter table public.caixa_movimentacoes
  add column if not exists cheque_numero text,
  add column if not exists cheque_banco  text,
  add column if not exists cheque_bom_para date;

comment on column public.caixa_movimentacoes.cheque_numero is
  'Numero do cheque lido da CMC-7 pela Sol (so digitos, com zeros a esquerda). Null fora de cheque.';
comment on column public.caixa_movimentacoes.cheque_banco is
  'Codigo do banco de 3 digitos (ex.: 341 Itau, 033 Santander). Null fora de cheque.';
comment on column public.caixa_movimentacoes.cheque_bom_para is
  'Data "bom para" so quando escrita no cheque; cheque a vista fica NULL.';

-- Lote (2+ cheques): le os campos do item de entrada de mesma ordem.
do $mig$
declare
  v_src text := pg_get_functiondef('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure);
  v_de text := $de$nullif(v_item->>'aluno_id','')::integer,case when jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') > 1 then null else nullif(v_item->>'canonical_fatura_id','')::uuid end)$de$;
  v_para text := $para$nullif(v_item->>'aluno_id','')::integer,case when jsonb_typeof(v_item->'fatura_ids') = 'array' and jsonb_array_length(v_item->'fatura_ids') > 1 then null else nullif(v_item->>'canonical_fatura_id','')::uuid end,
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_numero'),''),
    nullif(trim(p_payload->'itens'->(v_ordem - 1)->>'cheque_banco'),''),
    case when p_payload->'itens'->(v_ordem - 1)->>'cheque_bom_para' ~ '^\d{4}-\d{2}-\d{2}$'
         then (p_payload->'itens'->(v_ordem - 1)->>'cheque_bom_para')::date end)$para$;
  v_de_col text := ',aluno_id,fatura_id)';
  v_para_col text := ',aluno_id,fatura_id,cheque_numero,cheque_banco,cheque_bom_para)';
begin
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1
     or (length(v_src) - length(replace(v_src, v_de_col, ''))) / length(v_de_col) <> 1 then
    raise exception 'ANCORA_INSERT_LOTE: esperava 1 ocorrencia de cada trecho';
  end if;
  v_src := replace(v_src, v_de_col, v_para_col);
  execute replace(v_src, v_de, v_para);
end $mig$;

-- Lancamento simples (1 cheque): mesmos campos vindos do topo do payload.
do $mig$
declare
  v_src text := pg_get_functiondef('public.sol_caixa_lancar_recebimento(jsonb)'::regprocedure);
  v_de text := $de$     cartao_modalidade, cartao_parcelas, aluno_id, fatura_id)
  values
    (v_caixa, v_unidade, v_data, 'venda', 'entrada',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp, v_modal, v_parc, v_aluno_id, v_fatura_id)$de$;
  v_para text := $para$     cartao_modalidade, cartao_parcelas, aluno_id, fatura_id,
     cheque_numero, cheque_banco, cheque_bom_para)
  values
    (v_caixa, v_unidade, v_data, 'venda', 'entrada',
     v_forma, v_categoria, v_desc, v_valor,
     concat_ws(':', 'sol-agente', v_papel, v_num), v_resp, v_modal, v_parc, v_aluno_id, v_fatura_id,
     nullif(trim(p_payload->>'cheque_numero'),''),
     nullif(trim(p_payload->>'cheque_banco'),''),
     case when p_payload->>'cheque_bom_para' ~ '^\d{4}-\d{2}-\d{2}$' then (p_payload->>'cheque_bom_para')::date end)$para$;
begin
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_INSERT_SIMPLES: esperava 1 ocorrencia';
  end if;
  execute replace(v_src, v_de, v_para);
end $mig$;

do $prova$
begin
  if position('cheque_numero' in pg_get_functiondef('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure)) = 0
     or position('cheque_numero' in pg_get_functiondef('public.sol_caixa_lancar_recebimento(jsonb)'::regprocedure)) = 0 then
    raise exception 'PROVA: insert sem as colunas de cheque';
  end if;
  if position('multi_aluno_exige_dois_itens' in pg_get_functiondef('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure)) = 0 then
    raise exception 'PROVA: guarda de 2 itens sumiu';
  end if;
end $prova$;

notify pgrst, 'reload schema';
