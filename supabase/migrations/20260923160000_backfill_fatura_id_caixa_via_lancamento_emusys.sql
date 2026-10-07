-- 23/09/2026 — backfill v2 de fatura_id em caixa_movimentacoes, agora pela ponte
-- deterministica: financeiro_emusys_lancamentos.emusys_fatura_id (a fatura que a
-- Rose vinculou ao conciliar o lancamento bancario no Emusys).
--
-- Regra estrita, recalculada na aplicacao (o resultado esperado e' travado em
-- v_expected — se a base mudar entre ensaio e apply, aborta em vez de errar):
--
--   1. movimentacao de ENTRADA sem fatura_id, categoria parcela/passaporte/lojinha;
--   2. lancamento de entrada do Emusys na mesma unidade, valor exato, com
--      emusys_fatura_id preenchido e sumiu_em nulo;
--   3. mesmo dia; +-1 dia SO quando nao ha candidato no mesmo dia (a equipe pode
--      lancar no caixa na manha seguinte ao Pix cair);
--   4. a movimentacao aponta para UMA unica fatura (varios lancamentos no dia
--      apontando faturas distintas = ambiguo, fora);
--   5. a fatura existe no espelho e nao esta vinculada a outra movimentacao;
--   6. fatura disputada por 2+ movimentacoes do proprio lote: fora — medido,
--      todos os casos estouram o valor_pago (1200 vs 400 etc.), logo nao sao
--      pagamento parcial e sim dup de caixa ou coincidencia de valor/dia.
--
-- Resultado medido em 23/09/2026: 112 vinculos (98 mesmo dia, 14 com folga de
-- 1 dia). Ficam de fora: 62 ambiguos, 4 com fatura ja ocupada, 7 disputados.

do $$
declare
  v_expected constant integer := 112;
  v_count integer;
  v_linked_count integer;
  v_changed integer;
  v_core_before jsonb;
  v_core_after jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('backfill-fatura-id-caixa-lancamento-20260923-v1', 0));

  create temporary table expected(
    movimentacao_id uuid,
    fatura_id uuid,
    aluno_id integer
  ) on commit drop;

  insert into expected
  with alvo as (
    select m.id, m.unidade_id, m.data_movimento, m.valor
    from public.caixa_movimentacoes m
    where m.tipo = 'entrada' and m.fatura_id is null
      and m.categoria in ('parcela','passaporte','lojinha')
  ), par0 as (
    select a.id mov_id, l.emusys_fatura_id, l.unidade_id, 0 dd
    from alvo a join public.financeiro_emusys_lancamentos l
      on l.unidade_id = a.unidade_id and l.data = a.data_movimento
     and abs(l.valor - a.valor) < 0.011 and l.natureza = 'entrada'
     and l.emusys_fatura_id is not null and l.sumiu_em is null
  ), alvo2 as (
    select a.* from alvo a where not exists (select 1 from par0 p where p.mov_id = a.id)
  ), par1 as (
    select a.id mov_id, l.emusys_fatura_id, l.unidade_id, l.data - a.data_movimento dd
    from alvo2 a join public.financeiro_emusys_lancamentos l
      on l.unidade_id = a.unidade_id and l.data between a.data_movimento - 1 and a.data_movimento + 1
     and abs(l.valor - a.valor) < 0.011 and l.natureza = 'entrada'
     and l.emusys_fatura_id is not null and l.sumiu_em is null
  ), par as (select * from par0 union all select * from par1),
  uni as (
    select mov_id, min(emusys_fatura_id) emusys_fatura_id, (array_agg(unidade_id))[1] unidade_id
    from par group by mov_id having count(distinct emusys_fatura_id) = 1
  ), cand as (
    select u.mov_id, f.id fatura_id, u.unidade_id, f.emusys_student_id
    from uni u
    join public.emusys_faturas f
      on f.unidade_id = u.unidade_id and f.emusys_fatura_id = u.emusys_fatura_id
    where not exists (
      select 1 from public.caixa_movimentacoes o where o.fatura_id = f.id and o.id <> u.mov_id
    )
  ), disputada as (
    select fatura_id from cand group by fatura_id having count(*) > 1
  )
  select c.mov_id, c.fatura_id,
         (select a.id from public.alunos a
           where a.unidade_id = c.unidade_id and a.emusys_student_id = c.emusys_student_id::text
           limit 1) as aluno_id
  from cand c
  where c.fatura_id not in (select fatura_id from disputada);

  select count(*) into v_count from expected;
  if v_count <> v_expected then
    raise exception 'backfill_fatura_lanc: candidatos divergiram do medido (% de %)', v_count, v_expected;
  end if;

  -- Precondicao par a par: a movimentacao segue elegivel e a fatura confere com
  -- o lancamento que gerou o par (unidade, valor, data ate +-1 dia).
  select count(*) into v_count
    from expected e
    join public.caixa_movimentacoes m on m.id = e.movimentacao_id
    join public.emusys_faturas f on f.id = e.fatura_id
   where m.tipo = 'entrada'
     and m.unidade_id = f.unidade_id
     and (m.fatura_id is null or m.fatura_id = e.fatura_id)
     and (m.aluno_id is null or m.aluno_id = e.aluno_id)
     and exists (
       select 1 from public.financeiro_emusys_lancamentos l
        where l.unidade_id = m.unidade_id
          and l.emusys_fatura_id = f.emusys_fatura_id
          and l.natureza = 'entrada' and l.sumiu_em is null
          and abs(l.valor - m.valor) < 0.011
          and l.data between m.data_movimento - 1 and m.data_movimento + 1
     );
  if v_count <> v_expected then
    raise exception 'backfill_fatura_lanc: precondicao par a par divergente (% de %)', v_count, v_expected;
  end if;

  -- Fatura alvo nao pode estar vinculada a outra movimentacao fora do lote.
  select count(*) into v_count
    from expected e
   where exists (
     select 1 from public.caixa_movimentacoes o
      where o.fatura_id = e.fatura_id and o.id <> e.movimentacao_id
   );
  if v_count <> 0 then
    raise exception 'backfill_fatura_lanc: % faturas ja vinculadas a outra movimentacao', v_count;
  end if;

  -- Idempotencia: tudo vinculado => nada a fazer; parcial => aborta.
  select count(*) into v_linked_count
    from expected e
    join public.caixa_movimentacoes m
      on m.id = e.movimentacao_id
     and m.fatura_id = e.fatura_id
     and (e.aluno_id is null or m.aluno_id = e.aluno_id);
  if v_linked_count not in (0, v_expected) then
    raise exception 'backfill_fatura_lanc: estado parcial detectado (% de % vinculos)', v_linked_count, v_expected;
  end if;
  if v_linked_count = v_expected then
    raise notice 'backfill_fatura_lanc: % vinculos ja aplicados — nada a fazer', v_expected;
    return;
  end if;

  select jsonb_agg(to_jsonb(m) - 'fatura_id' - 'aluno_id' - 'updated_at' order by m.id)
    into v_core_before
    from public.caixa_movimentacoes m
   where m.id in (select movimentacao_id from expected);

  update public.caixa_movimentacoes m
     set fatura_id = e.fatura_id,
         aluno_id = coalesce(m.aluno_id, e.aluno_id)
    from expected e
   where m.id = e.movimentacao_id
     and m.fatura_id is null;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then
    raise exception 'backfill_fatura_lanc: esperava atualizar %, atualizou %', v_expected, v_changed;
  end if;

  select jsonb_agg(to_jsonb(m) - 'fatura_id' - 'aluno_id' - 'updated_at' order by m.id)
    into v_core_after
    from public.caixa_movimentacoes m
   where m.id in (select movimentacao_id from expected);
  if v_core_before is distinct from v_core_after then
    raise exception 'backfill_fatura_lanc: campo alheio ao vinculo foi alterado';
  end if;

  select count(*) into v_count
    from expected e
    join public.caixa_movimentacoes m
      on m.id = e.movimentacao_id and m.fatura_id = e.fatura_id;
  if v_count <> v_expected then
    raise exception 'backfill_fatura_lanc: readback nao confirmou os % vinculos', v_expected;
  end if;

  raise notice 'backfill_fatura_lanc: % vinculos aplicados via emusys_fatura_id; demais campos preservados', v_expected;
end
$$;
