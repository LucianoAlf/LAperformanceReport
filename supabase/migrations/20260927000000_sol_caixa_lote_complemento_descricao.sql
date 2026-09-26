-- Lote do caixa da Sol: complemento de descrição vindo da ENTRADA (27/09/2026)
--
-- Os cheques do lote de depósito passam a entrar no caixa da Sol (decisão do Alf,
-- 26/09: "entra no caixa do LA Report, o Super Folha já puxa o caixa da Sol").
-- 2+ cheques viram UM lote (`sol_caixa_lancar_recebimento_lote_v1`), e cada item
-- vira uma movimentação com a descrição que o VALIDADOR devolve — a da fatura
-- ("Parcela 09/2026 - aluno · resp."). O número do cheque, que só a entrada
-- conhece, se perdia; e é por ele que o Super Folha liga o depósito e a devolução
-- do banco ao cheque.
--
-- Mudança MÍNIMA: depois da descrição montada, se o item de entrada de mesma
-- ordem trouxer `complemento_descricao`, ele é anexado (" · cheque Santander nº
-- 000212", até 80 caracteres). Nada mais muda: validação, soma, invariante de
-- itens, vínculo de fatura.
-- ⚠️ A ordem do snapshot é a ordem da entrada (o validador itera `p_itens` e o
--    invariante recusa quando o número de itens diverge), então o índice
--    `v_ordem - 1` aponta para o mesmo item.
-- ⚠️ Sem o campo, comportamento idêntico ao anterior (lotes de Pix intactos).
-- Custo: zero (um jsonb extra por item já lido).

do $mig$
declare
  v_src text := pg_get_functiondef('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure);
  v_de text := $de$    if v_desc is null or length(v_desc) < 3 then
      v_desc := 'Recebimento via Sol';
    end if;
$de$;
  v_para text := $para$    if v_desc is null or length(v_desc) < 3 then
      v_desc := 'Recebimento via Sol';
    end if;
    -- complemento que só a ENTRADA conhece (ex.: "cheque Santander nº 000212").
    if nullif(trim(coalesce(p_payload->'itens'->(v_ordem - 1)->>'complemento_descricao','')),'') is not null then
      v_desc := v_desc || ' · ' || left(trim(p_payload->'itens'->(v_ordem - 1)->>'complemento_descricao'), 80);
    end if;
$para$;
begin
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_DESCRICAO_LOTE: esperava 1 ocorrencia';
  end if;
  execute replace(v_src, v_de, v_para);
end $mig$;

do $prova$
declare v_src text := pg_get_functiondef('public.sol_caixa_lancar_recebimento_lote_v1(jsonb)'::regprocedure);
begin
  if position('complemento_descricao' in v_src) = 0 then raise exception 'PROVA: complemento ausente'; end if;
  if position('multi_aluno_exige_dois_itens' in v_src) = 0 then raise exception 'PROVA: guarda de 2 itens sumiu'; end if;
end $prova$;
