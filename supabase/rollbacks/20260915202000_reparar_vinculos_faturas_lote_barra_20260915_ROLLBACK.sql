-- Rollback de emergencia do reparo de vinculos da Barra em 15/09/2026.
-- Executar somente com nova aprovacao explicita do Alf.
-- Restaura os dois fatura_id para null; nao altera valor, caixa ou lote.

do $$
declare
  v_unidade constant uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_caixa constant uuid := '69e56cba-5597-4d30-86b5-5121f7729eb9';
  v_lote constant uuid := 'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6';
  v_anchor_count integer;
  v_count integer;
  v_linked_count integer;
  v_changed integer;
  v_mov_core_before jsonb;
  v_mov_core_after jsonb;
  v_caixa_core_before jsonb;
  v_caixa_core_after jsonb;
  v_lote_items_before jsonb;
  v_lote_items_after jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('reparar-vinculos-faturas-lote-barra-20260915-v1', 0));

  select count(*)
    into v_anchor_count
  from public.caixa_movimentacoes
  where id in (
    'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
    '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
  );
  if v_anchor_count = 0 then
    raise notice 'incidente historico ausente neste banco — nada a reverter';
    return;
  end if;
  if v_anchor_count <> 2 then
    raise exception 'rollback_reparo_barra: conjunto de movimentacoes incompleto';
  end if;

  perform 1 from public.caixas_diarios where id = v_caixa for update;
  perform 1 from public.sol_caixa_lotes_v1 where id = v_lote for update;
  perform 1 from public.sol_caixa_lote_itens_v1 where lote_id = v_lote for update;
  perform 1
    from public.caixa_movimentacoes
   where id in (
     'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
     '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
   )
   for update;

  with expected(movimentacao_id, aluno_id, fatura_id) as (
    values
      ('f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid, 1456, '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid),
      ('23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid, 963, '794fae0b-5075-484b-ae18-94016717d0d0'::uuid)
  )
  select count(*)
    into v_count
  from expected e
  join public.caixa_movimentacoes m on m.id = e.movimentacao_id
  where m.caixa_diario_id = v_caixa
    and m.unidade_id = v_unidade
    and m.data_movimento = date '2026-09-15'
    and m.ambiente = 'venda'
    and m.tipo = 'entrada'
    and m.forma_pagamento = 'pix'
    and m.categoria = 'parcela'
    and m.valor = 365.00
    and m.aluno_id = e.aluno_id
    and m.created_at = timestamptz '2026-09-15 18:57:51.663584+00'
    and (m.fatura_id is null or m.fatura_id = e.fatura_id);
  if v_count <> 2 then
    raise exception 'rollback_reparo_barra: precondicao das movimentacoes divergente';
  end if;

  with expected(movimentacao_id, fatura_id) as (
    values
      ('f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid, '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid),
      ('23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid, '794fae0b-5075-484b-ae18-94016717d0d0'::uuid)
  )
  select count(*)
    into v_linked_count
  from expected e
  join public.caixa_movimentacoes m
    on m.id = e.movimentacao_id and m.fatura_id = e.fatura_id;
  if v_linked_count = 0 then
    raise notice 'rollback_reparo_barra: dois vinculos ja estao nulos — nada a fazer';
    return;
  end if;
  if v_linked_count <> 2 then
    raise exception 'rollback_reparo_barra: estado parcial detectado (% de 2 vinculos)', v_linked_count;
  end if;

  select count(*)
    into v_count
  from (
    select li.lote_id
    from public.sol_caixa_lote_itens_v1 li
    where li.lote_id = v_lote
    group by li.lote_id
    having count(*) = 3
       and count(distinct li.movimentacao_id) = 3
       and sum(li.valor) = 1095.00
       and count(*) filter (
         where li.ordem = 2
           and li.movimentacao_id = 'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid
           and li.canonical_fatura_id is null
           and li.item_json->>'canonical_fatura_id' is null
       ) = 1
       and count(*) filter (
         where li.ordem = 3
           and li.movimentacao_id = '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
           and li.canonical_fatura_id is null
           and li.item_json->>'canonical_fatura_id' is null
       ) = 1
  ) lote_valido;
  if v_count <> 1 then
    raise exception 'rollback_reparo_barra: snapshot do lote divergente';
  end if;

  select jsonb_agg(to_jsonb(m) - 'fatura_id' - 'updated_at' order by m.id)
    into v_mov_core_before
  from public.caixa_movimentacoes m
  where m.id in (
    'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
    '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
  );
  select to_jsonb(c) - 'updated_at'
    into v_caixa_core_before
  from public.caixas_diarios c
  where c.id = v_caixa;
  select jsonb_agg(to_jsonb(li) order by li.ordem)
    into v_lote_items_before
  from public.sol_caixa_lote_itens_v1 li
  where li.lote_id = v_lote;

  update public.caixa_movimentacoes
     set fatura_id = null
   where (id = 'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid
          and fatura_id = '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid)
      or (id = '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
          and fatura_id = '794fae0b-5075-484b-ae18-94016717d0d0'::uuid);
  get diagnostics v_changed = row_count;
  if v_changed <> 2 then
    raise exception 'rollback_reparo_barra: esperava atualizar 2 movimentacoes, atualizou %', v_changed;
  end if;

  select jsonb_agg(to_jsonb(m) - 'fatura_id' - 'updated_at' order by m.id)
    into v_mov_core_after
  from public.caixa_movimentacoes m
  where m.id in (
    'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
    '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
  );
  select to_jsonb(c) - 'updated_at'
    into v_caixa_core_after
  from public.caixas_diarios c
  where c.id = v_caixa;
  select jsonb_agg(to_jsonb(li) order by li.ordem)
    into v_lote_items_after
  from public.sol_caixa_lote_itens_v1 li
  where li.lote_id = v_lote;

  if v_mov_core_before is distinct from v_mov_core_after then
    raise exception 'rollback_reparo_barra: campo financeiro alheio ao vinculo foi alterado';
  end if;
  if v_caixa_core_before is distinct from v_caixa_core_after then
    raise exception 'rollback_reparo_barra: estado financeiro do caixa foi alterado';
  end if;
  if v_lote_items_before is distinct from v_lote_items_after then
    raise exception 'rollback_reparo_barra: snapshot do lote foi alterado';
  end if;

  select count(*)
    into v_count
  from public.caixa_movimentacoes m
  where m.id in (
    'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
    '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
  )
    and m.fatura_id is null;
  if v_count <> 2 then
    raise exception 'rollback_reparo_barra: readback final nao confirmou os 2 nulos';
  end if;

  raise notice 'rollback_reparo_barra: 2 vinculos removidos; valores, caixa e snapshot preservados';
end
$$;
