-- `sol_caixa_abrir` recusa abrir o dia quando o dia anterior está ABERTO.
-- Decisão do Alf, 2026-08-22, após o incidente do caixa da Barra.
--
-- O INCIDENTE (21-22/08, Barra): a Sol mandou o preview de fechamento de 21/08 às 19:30
-- (saldo final R$ 62,80, com retirada de R$ 950) e ninguém respondeu "pode" — o Arthur
-- estava fora do horário ("tava dormindo no ônibus"). O caixa de 21/08 ficou aberto. Na
-- manhã de 22/08 a Sol abriu o dia com carry-over de R$ 1.012,80 — ERRADO — porque o
-- carry-over lê o `saldo_final_conferido` do último dia com `status='fechado'`, que era
-- 20/08: o dia aberto no meio é INVISÍVEL para a fórmula, e a retirada de 950 sumiu do
-- saldo. Corrigido à mão em 22/08 (fechamento retroativo de 21/08 + saldo inicial de
-- 22/08 → 62,80, rastro em `sol_caixa_lancamento_auditoria`).
--
-- A TRAVA (fail-closed): antes de abrir, se existir caixa de data ANTERIOR com
-- `status='aberto'` na unidade, recusa com motivo `fechamento_pendente_dia_anterior` e
-- devolve a pendência (id, data, saldo final calculado dos movimentos) para a Sol
-- oferecer o fechamento de ontem PRIMEIRO — um "pode" fecha ontem, outro abre hoje.
--
-- ⚠️ Fail-closed por construção: o runtime atual da Sol, sem tratar o motivo novo,
-- apenas não abre (mensagem genérica de recusa) — o que já é infinitamente melhor que
-- abrir com saldo errado. O tratamento bonito (oferecer o fechamento pendente) é ajuste
-- de runtime, com o payload de `pendencia` já pronto neste retorno.
-- ⚠️ O saldo da pendência é RECOMPUTADO dos movimentos do cofre (mesma conta da
-- `sol_caixa_recalcular_cofre`), não lido de campo cacheado.
-- ⚠️ Decisão organizacional que acompanha (Alf, no grupo): fechamento do caixa é
-- responsabilidade de quem está NA UNIDADE no horário (gerente organiza a escala) —
-- automatizar abrir/fechar sem "pode" foi pedido pelo Arthur e RECUSADO por ora
-- ("a Sol ainda não está pronta").

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_abrir';

  if position('fechamento_pendente_dia_anterior' in v_def) > 0 then
    raise notice 'trava ja aplicada';
    return;
  end if;

  -- 1) variavel da pendencia
  v_new := replace(v_def,
    $$v_motivo text; v_caixa uuid; v_status text; v_saldo numeric;$$,
    $$v_motivo text; v_caixa uuid; v_status text; v_saldo numeric; v_pend record;$$);

  -- 2) checagem do dia anterior aberto (depois do check do caixa de hoje)
  v_new := replace(v_new,
    $$    elsif v_caixa is not null then v_motivo:='caixa_ja_existe_hoje'; end if;
  end if;$$,
    $$    elsif v_caixa is not null then v_motivo:='caixa_ja_existe_hoje'; end if;
  end if;
  if v_motivo is null then
    select cd.id, cd.data_caixa,
           cd.saldo_inicial_cofre
           + coalesce((select sum(m.valor) from public.caixa_movimentacoes m where m.caixa_diario_id=cd.id and m.ambiente='cofre' and m.tipo='entrada'),0)
           - coalesce((select sum(m.valor) from public.caixa_movimentacoes m where m.caixa_diario_id=cd.id and m.ambiente='cofre' and m.tipo='saida'),0) as saldo_pendente
      into v_pend
      from public.caixas_diarios cd
     where cd.unidade_id=v_unidade and cd.data_caixa<v_data and cd.status='aberto'
     order by cd.data_caixa desc limit 1;
    if v_pend.id is not null then v_motivo:='fechamento_pendente_dia_anterior'; end if;
  end if;$$);

  -- 3) retorno de recusa carrega a pendencia
  v_new := replace(v_new,
    $$    return jsonb_build_object('ok',false,'motivo',v_motivo,'data',v_data);$$,
    $$    return jsonb_build_object('ok',false,'motivo',v_motivo,'data',v_data)
      || case when v_motivo='fechamento_pendente_dia_anterior' then
           jsonb_build_object('pendencia', jsonb_build_object(
             'caixa_diario_id', v_pend.id,
             'data_caixa', v_pend.data_caixa,
             'saldo_final_calculado', v_pend.saldo_pendente))
         else '{}'::jsonb end;$$);

  if v_new = v_def or position('v_pend record' in v_new) = 0
     or position('pendencia' in v_new) = 0 then
    raise exception 'replaces incompletos na trava — abortando';
  end if;

  execute v_new;
end $mig$;
