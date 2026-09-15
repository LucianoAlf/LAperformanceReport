-- 15/09/2026 — reparo historico, aprovado pelo Alf, de dois vinculos de fatura
-- que ficaram nulos durante uma corrida de sincronizacao no Caixa da Barra.
--
-- Escopo: atualizar somente caixa_movimentacoes.fatura_id nas duas entradas ja
-- existentes. Valor, caixa, lote e o snapshot aprovado permanecem imutaveis.
-- O snapshot do lote continua mostrando a ausencia original de vinculo porque
-- ele e evidencia do que foi aprovado; a correcao operacional mora no movimento.

do $$
declare
  v_unidade constant uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  v_caixa constant uuid := '69e56cba-5597-4d30-86b5-5121f7729eb9';
  v_lote constant uuid := 'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6';
  v_preview constant uuid := '646c43d3-e2ec-4698-8bba-4e9cab5de9d7';
  v_approval constant uuid := 'b45af2f0-b459-40a3-8894-caac9f05640a';
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

  -- Banco novo/ensaio nao possui o incidente historico.
  select count(*)
    into v_anchor_count
  from (
    select id::text from public.sol_caixa_lotes_v1
     where id = v_lote
    union all
    select id::text from public.caixa_movimentacoes
     where id in (
       'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
       '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
     )
    union all
    select id::text from public.emusys_faturas
     where id in (
       '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid,
       '794fae0b-5075-484b-ae18-94016717d0d0'::uuid
     )
  ) anchors;

  if v_anchor_count = 0 then
    raise notice 'incidente historico ausente neste banco — nada a reparar';
    return;
  end if;

  perform 1 from public.caixas_diarios where id = v_caixa for update;
  perform 1 from public.sol_caixa_lotes_v1 where id = v_lote for update;
  perform 1 from public.sol_caixa_lote_itens_v1 where lote_id = v_lote for update;
  perform 1
    from public.caixa_movimentacoes
   where id in (
     'bab65cce-6a78-4c32-9c45-d05d78b53aa6'::uuid,
     'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
     '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
   )
   for update;
  perform 1
    from public.emusys_faturas
   where id in (
     'd2e54b74-2008-4e2a-a265-a016244ec661'::uuid,
     '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid,
     '794fae0b-5075-484b-ae18-94016717d0d0'::uuid
   )
   for share;

  select count(*)
    into v_count
  from public.caixas_diarios c
  where c.id = v_caixa
    and c.unidade_id = v_unidade
    and c.data_caixa = date '2026-09-15';
  if v_count <> 1 then
    raise exception 'reparo_barra: precondicao do caixa divergente';
  end if;

  select count(*)
    into v_count
  from public.sol_caixa_lotes_v1 l
  where l.id = v_lote
    and l.unidade_id = v_unidade
    and l.caixa_diario_id = v_caixa
    and l.preview_id = v_preview
    and l.approval_id = v_approval
    and l.valor_total = 1095.00
    and l.forma_pagamento = 'pix'
    and l.categoria = 'parcela'
    and l.status = 'lancado'
    and l.criado_em = timestamptz '2026-09-15 18:57:51.663584+00';
  if v_count <> 1 then
    raise exception 'reparo_barra: precondicao do lote divergente';
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
         where li.ordem = 1
           and li.movimentacao_id = 'bab65cce-6a78-4c32-9c45-d05d78b53aa6'::uuid
           and li.canonical_fatura_id = 'd2e54b74-2008-4e2a-a265-a016244ec661'
       ) = 1
       and count(*) filter (
         where li.ordem = 2
           and li.movimentacao_id = 'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid
           and li.valor = 365.00
           and li.competencia = '09/2026'
           and li.categoria = 'parcela'
           and li.canonical_fatura_id is null
           and li.item_json->>'canonical_fatura_id' is null
       ) = 1
       and count(*) filter (
         where li.ordem = 3
           and li.movimentacao_id = '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
           and li.valor = 365.00
           and li.competencia = '09/2026'
           and li.categoria = 'parcela'
           and li.canonical_fatura_id is null
           and li.item_json->>'canonical_fatura_id' is null
       ) = 1
  ) lote_valido;
  if v_count <> 1 then
    raise exception 'reparo_barra: precondicao dos itens do lote divergente';
  end if;

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
    raise exception 'reparo_barra: precondicao das movimentacoes divergente';
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

  if v_linked_count not in (0, 2) then
    raise exception 'reparo_barra: estado parcial detectado (% de 2 vinculos)', v_linked_count;
  end if;

  with expected(movimentacao_id, fatura_id) as (
    values
      ('f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid, '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid),
      ('23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid, '794fae0b-5075-484b-ae18-94016717d0d0'::uuid)
  )
  select count(*)
    into v_count
  from expected e
  where (
    select count(*)
    from public.caixa_movimentacoes other
    where other.fatura_id = e.fatura_id
      and other.id <> e.movimentacao_id
  ) <> 0;
  if v_count <> 0 then
    raise exception 'reparo_barra: fatura alvo ja vinculada a outra movimentacao';
  end if;

  with expected(movimentacao_id, fatura_id) as (
    values
      ('f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid, '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid),
      ('23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid, '794fae0b-5075-484b-ae18-94016717d0d0'::uuid)
  )
  select count(*)
    into v_count
  from expected e
  join public.caixa_movimentacoes m on m.id = e.movimentacao_id
  join public.alunos a on a.id = m.aluno_id and a.unidade_id = m.unidade_id
  where (
    select count(*)
    from public.emusys_faturas f
    where f.unidade_id = m.unidade_id
      and f.emusys_student_id::text = a.emusys_student_id
      and f.competencia = date '2026-09-01'
      and coalesce(f.valor_pago, f.valor_original) = m.valor
  ) <> 1
  or not exists (
    select 1
    from public.emusys_faturas f
    where f.id = e.fatura_id
      and f.unidade_id = m.unidade_id
      and f.emusys_student_id::text = a.emusys_student_id
      and f.status = 'paga'
      and f.competencia = date '2026-09-01'
      and f.data_vencimento = date '2026-09-05'
      and f.data_pagamento = date '2026-09-15'
      and f.valor_original = 365.00
      and f.valor_pago = 365.00
      and f.desconto_aplicado = 0
  );
  if v_count <> 0 then
    raise exception 'reparo_barra: correspondencia canonica deixou de ser unica/exata';
  end if;

  if v_linked_count = 2 then
    raise notice 'reparo_barra: dois vinculos ja aplicados — nada a fazer';
    return;
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
     set fatura_id = case id
       when 'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid
         then '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid
       when '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
         then '794fae0b-5075-484b-ae18-94016717d0d0'::uuid
     end
   where id in (
     'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
     '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
   )
     and fatura_id is null;
  get diagnostics v_changed = row_count;
  if v_changed <> 2 then
    raise exception 'reparo_barra: esperava atualizar 2 movimentacoes, atualizou %', v_changed;
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
    raise exception 'reparo_barra: campo financeiro alheio ao vinculo foi alterado';
  end if;
  if v_caixa_core_before is distinct from v_caixa_core_after then
    raise exception 'reparo_barra: estado financeiro do caixa foi alterado';
  end if;
  if v_lote_items_before is distinct from v_lote_items_after then
    raise exception 'reparo_barra: snapshot do lote foi alterado';
  end if;

  with expected(movimentacao_id, fatura_id) as (
    values
      ('f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid, '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid),
      ('23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid, '794fae0b-5075-484b-ae18-94016717d0d0'::uuid)
  )
  select count(*)
    into v_count
  from expected e
  join public.caixa_movimentacoes m
    on m.id = e.movimentacao_id and m.fatura_id = e.fatura_id;
  if v_count <> 2 then
    raise exception 'reparo_barra: readback final nao confirmou os 2 vinculos';
  end if;

  raise notice 'reparo_barra: 2 vinculos aplicados; valores, caixa e snapshot preservados';
end
$$;
