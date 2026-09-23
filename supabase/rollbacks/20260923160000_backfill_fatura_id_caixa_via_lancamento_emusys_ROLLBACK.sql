-- ROLLBACK de 20260923160000_backfill_fatura_id_caixa_via_lancamento_emusys.sql
--
-- Desfaz os 112 vinculos aplicados pelo backfill v2 (caixa x lancamento Emusys
-- via emusys_fatura_id). Recalcula o mesmo conjunto candidato — so desfaz se o
-- lote bater exatamente; se a base divergiu, aborta em vez de desvincular errado.
-- Somente fatura_id volta a null: aluno_id pode ter existido antes do backfill
-- (a Sol grava aluno sem fatura), entao zerar aqui apagaria dado que nao foi
-- o backfill quem escreveu.

do $$
declare
  v_expected constant integer := 112;
  v_count integer;
  v_changed integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('backfill-fatura-id-caixa-lancamento-20260923-v1', 0));

  create temporary table applied(movimentacao_id uuid, fatura_id uuid) on commit drop;

  insert into applied
  with alvo as (
    select m.id, m.unidade_id, m.data_movimento, m.valor
    from public.caixa_movimentacoes m
    where m.tipo = 'entrada' and m.fatura_id is not null
      and m.categoria in ('parcela','passaporte','lojinha')
  ), par as (
    select a.id mov_id, l.emusys_fatura_id, l.unidade_id
    from alvo a join public.financeiro_emusys_lancamentos l
      on l.unidade_id = a.unidade_id
     and l.data between a.data_movimento - 1 and a.data_movimento + 1
     and abs(l.valor - a.valor) < 0.011 and l.natureza = 'entrada'
     and l.emusys_fatura_id is not null and l.sumiu_em is null
  )
  select distinct p.mov_id, f.id
  from par p
  join public.emusys_faturas f
    on f.unidade_id = p.unidade_id and f.emusys_fatura_id = p.emusys_fatura_id
  join public.caixa_movimentacoes m on m.id = p.mov_id and m.fatura_id = f.id;

  select count(*) into v_count from applied;
  if v_count <> v_expected then
    raise exception 'rollback_fatura_lanc: conjunto aplicado diverge (% de %) — abortando, revise manual', v_count, v_expected;
  end if;

  update public.caixa_movimentacoes m
     set fatura_id = null
    from applied a
   where m.id = a.movimentacao_id
     and m.fatura_id = a.fatura_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then
    raise exception 'rollback_fatura_lanc: esperava desfazer %, desfez %', v_expected, v_changed;
  end if;

  raise notice 'rollback_fatura_lanc: % vinculos desfeitos', v_changed;
end
$$;
