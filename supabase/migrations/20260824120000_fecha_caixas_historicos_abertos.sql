-- Fechamento retroativo dos 22 caixas históricos que ficaram abertos nas 3 unidades.
-- Autorizado pelo Alf em 2026-08-24 ("pode fechar todos").
--
-- CONTEXTO: apareceram na investigação do incidente de 24/08 (trava de fechamento
-- pendente bloqueando a abertura — ver 20260824110000). São dias em que a operação
-- abriu o caixa e ninguém respondeu o fechamento: Recreio 10, Barra 7, CG 5, de
-- 10/06 a 13/08/2026.
--
-- REGRA APLICADA: a mesma da `sol_caixa_fechar` — saldo final = saldo inicial do cofre
-- + entradas de cofre − saídas de cofre, recomputado dos movimentos reais de cada dia.
-- Nenhum valor é inventado, nenhuma movimentação é criada ou alterada.
--
-- ⚠️ NÃO recalcula a cadeia de carry-over dos dias seguintes. Cada caixa fecha com o
-- que ele próprio tem; os saldos iniciais posteriores já foram reconciliados pela
-- operação ao longo do tempo (o cofre físico é conferido a cada abertura). Reescrever a
-- cadeia retroativamente sobrescreveria conferência humana com aritmética — o oposto do
-- que este projeto faz.
--
-- ⚠️ Sem impacto no fluxo corrente: os caixas de 24/08 já estavam abertos quando isto
-- rodou, e o carry-over de amanhã lê o último FECHADO, que passa a ser o de hoje.
--
-- Rastro: `fechado_por` identifica o fechamento retroativo e a autorização; `observacoes`
-- guarda a nota; cada linha gera registro em `sol_caixa_lancamento_auditoria`.

do $mig$
declare
  v_qtd integer;
  v_fechados integer;
begin
  select count(*) into v_qtd from public.caixas_diarios
  where status = 'aberto' and data_caixa < (now() at time zone 'America/Sao_Paulo')::date;

  if v_qtd = 0 then
    raise notice 'nenhum caixa historico aberto — nada a fazer';
    return;
  end if;
  if v_qtd > 40 then
    raise exception 'esperava ~22 caixas historicos, achei % — abortando por seguranca', v_qtd;
  end if;

  with alvos as (
    select cd.id, cd.unidade_id, cd.data_caixa,
           cd.saldo_inicial_cofre
             + coalesce((select sum(m.valor) from public.caixa_movimentacoes m
                         where m.caixa_diario_id = cd.id and m.ambiente='cofre' and m.tipo='entrada'), 0)
             - coalesce((select sum(m.valor) from public.caixa_movimentacoes m
                         where m.caixa_diario_id = cd.id and m.ambiente='cofre' and m.tipo='saida'), 0) as saldo_final
    from public.caixas_diarios cd
    where cd.status = 'aberto'
      and cd.data_caixa < (now() at time zone 'America/Sao_Paulo')::date
  ), fechados as (
    update public.caixas_diarios cd
       set status = 'fechado',
           saldo_final_calculado = a.saldo_final,
           saldo_final_conferido = a.saldo_final,
           fechado_por = 'Fechamento retroativo (LA Report) — autorizado por Alf em 24/08/2026',
           fechado_em = now(),
           updated_at = now(),
           observacoes = coalesce(cd.observacoes || ' · ', '')
             || 'Caixa ficou aberto na epoca; fechado retroativamente em 24/08/2026 com saldo recomputado dos movimentos do proprio dia.'
      from alvos a
     where cd.id = a.id
    returning cd.id, cd.unidade_id, cd.data_caixa, cd.saldo_final_conferido
  )
  insert into public.sol_caixa_lancamento_auditoria(
    ator_numero, ator_papel, chat_id, unidade_id, data_caixa, payload, resultado, caixa_diario_id)
  select null, 'la_report_admin', null, f.unidade_id, f.data_caixa,
         jsonb_build_object('acao','fechamento_retroativo_lote','autorizacao','Alf 24/08/2026',
                            'saldo_final', f.saldo_final_conferido),
         'fechado', f.id
  from fechados f;

  get diagnostics v_fechados = row_count;
  raise notice 'caixas historicos fechados: % (de % abertos)', v_fechados, v_qtd;
end $mig$;
