\set ON_ERROR_STOP on

begin;

-- O schema minimo do ensaio nao traz o acervo geral de auditoria. Criamos a
-- forma estrutural de producao dentro da transacao para provar os dois UPDATEs.
create table if not exists public.audit_log (
  id uuid primary key,
  tabela character varying,
  registro_id uuid,
  acao character varying,
  dados_antigos jsonb,
  dados_novos jsonb,
  usuario character varying,
  created_at timestamptz,
  auth_user_id uuid,
  origem text,
  registro_id_text text
);

do $$
begin
  if exists (
    select 1 from public.caixa_movimentacoes
    where id in (
      'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
      '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
    )
  ) then
    raise exception 'fixture do reparo colidiu com dado preexistente';
  end if;
end
$$;

alter table public.alunos disable trigger user;
alter table public.emusys_faturas disable trigger user;
alter table public.caixas_diarios disable trigger user;
alter table public.caixa_movimentacoes disable trigger user;

insert into public.unidades (id, nome, codigo)
values ('368d47f5-2d88-4475-bc14-ba084a9a348e', 'Unidade Teste Vinculos', 'TVI');

insert into public.alunos (id, nome, unidade_id, emusys_student_id, status)
values
  (963, 'Aluno Teste A', '368d47f5-2d88-4475-bc14-ba084a9a348e', '963001', 'ativo'),
  (1456, 'Aluno Teste B', '368d47f5-2d88-4475-bc14-ba084a9a348e', '1456001', 'ativo'),
  (7777, 'Aluno Teste C', '368d47f5-2d88-4475-bc14-ba084a9a348e', '7777001', 'ativo');

insert into public.emusys_faturas (
  id, unidade_id, unidade_codigo, emusys_fatura_id, emusys_student_id,
  descricao, status, data_vencimento, data_pagamento, competencia,
  valor_original, valor_pago, desconto_aplicado, synced_at
) values
  ('38c0478a-9d15-42b4-b56e-bdfec424b675', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'TVI', 900001, 1456001,
   'Parcela teste B', 'paga', '2026-09-05', '2026-09-15', '2026-09-01', 365, 365, 0, '2026-09-15 20:03:29+00'),
  ('794fae0b-5075-484b-ae18-94016717d0d0', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'TVI', 900002, 963001,
   'Parcela teste A', 'paga', '2026-09-05', '2026-09-15', '2026-09-01', 365, 365, 0, '2026-09-15 20:03:29+00'),
  ('d2e54b74-2008-4e2a-a265-a016244ec661', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'TVI', 900003, 7777001,
   'Parcela teste C', 'paga', '2026-09-05', '2026-09-15', '2026-09-01', 365, 365, 0, '2026-09-15 18:50:00+00');

insert into public.caixas_diarios (
  id, unidade_id, data_caixa, status, saldo_inicial_cofre,
  saldo_final_calculado, aberto_em, created_at, updated_at
) values (
  '69e56cba-5597-4d30-86b5-5121f7729eb9',
  '368d47f5-2d88-4475-bc14-ba084a9a348e',
  '2026-09-15', 'aberto', 1562.80, 1562.80,
  '2026-09-15 17:03:08+00', '2026-09-15 17:03:08+00', '2026-09-15 18:57:51.663584+00'
);

insert into public.caixa_movimentacoes (
  id, caixa_diario_id, unidade_id, data_movimento, ambiente, tipo,
  forma_pagamento, categoria, descricao, valor, criado_por, aluno_id,
  fatura_id, created_at, updated_at
) values
  ('bab65cce-6a78-4c32-9c45-d05d78b53aa6', '69e56cba-5597-4d30-86b5-5121f7729eb9', '368d47f5-2d88-4475-bc14-ba084a9a348e',
   '2026-09-15', 'venda', 'entrada', 'pix', 'parcela', 'Parcela teste C', 365, 'fixture', 7777,
   'd2e54b74-2008-4e2a-a265-a016244ec661', '2026-09-15 18:57:51.663584+00', '2026-09-15 18:57:51.663584+00'),
  ('f0771e40-846b-49d2-b5fe-dc0a61b211c1', '69e56cba-5597-4d30-86b5-5121f7729eb9', '368d47f5-2d88-4475-bc14-ba084a9a348e',
   '2026-09-15', 'venda', 'entrada', 'pix', 'parcela', 'Parcela teste B', 365, 'fixture', 1456,
   null, '2026-09-15 18:57:51.663584+00', '2026-09-15 18:57:51.663584+00'),
  ('23726ff5-ee7e-45ce-9780-dcdd6c553a80', '69e56cba-5597-4d30-86b5-5121f7729eb9', '368d47f5-2d88-4475-bc14-ba084a9a348e',
   '2026-09-15', 'venda', 'entrada', 'pix', 'parcela', 'Parcela teste A', 365, 'fixture', 963,
   null, '2026-09-15 18:57:51.663584+00', '2026-09-15 18:57:51.663584+00');

alter table public.alunos enable trigger user;
alter table public.emusys_faturas enable trigger user;
alter table public.caixas_diarios enable trigger user;
alter table public.caixa_movimentacoes enable trigger user;

insert into public.sol_caixa_shadow_eventos_v1 (
  id, event_id_hash, chat_id_hash, unidade_id, observed_at, status
) values (
  '11111111-2222-4333-8444-555555555555', 'fixture-reparo-vinculos-barra',
  'fixture-chat', '368d47f5-2d88-4475-bc14-ba084a9a348e', '2026-09-15 18:50:00+00', 'observed'
);

insert into public.sol_caixa_shadow_previews_v1 (
  id, evento_id, preview_hash, unidade_id, operacao, categoria,
  valor_centavos, forma, status, preview_json, criado_em
) values (
  '646c43d3-e2ec-4698-8bba-4e9cab5de9d7', '11111111-2222-4333-8444-555555555555',
  'fixture-preview', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'lancar_recebimento',
  'parcela', 109500, 'pix', 'public_approved', '{}', '2026-09-15 18:50:00+00'
);

insert into public.sol_caixa_shadow_approvals_v1 (
  id, preview_id, approval_event_hash, actor_id_hash, decision, decision_json, criado_em
) values (
  'b45af2f0-b459-40a3-8894-caac9f05640a', '646c43d3-e2ec-4698-8bba-4e9cab5de9d7',
  'fixture-approval', 'fixture-actor', 'approved', '{}', '2026-09-15 18:57:00+00'
);

insert into public.sol_caixa_lotes_v1 (
  id, unidade_id, caixa_diario_id, preview_id, approval_id, idempotency_key,
  valor_total, forma_pagamento, categoria, payload, status, criado_em
) values (
  'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6', '368d47f5-2d88-4475-bc14-ba084a9a348e',
  '69e56cba-5597-4d30-86b5-5121f7729eb9', '646c43d3-e2ec-4698-8bba-4e9cab5de9d7',
  'b45af2f0-b459-40a3-8894-caac9f05640a', 'fixture-reparo-vinculos-barra',
  1095, 'pix', 'parcela', '{}', 'lancado', '2026-09-15 18:57:51.663584+00'
);

insert into public.sol_caixa_lote_itens_v1 (
  id, lote_id, ordem, aluno_nome, competencia, categoria, valor,
  canonical_fatura_id, movimentacao_id, item_json, criado_em
) values
  ('b203cf9f-a552-4a30-8823-351931899fcc', 'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6', 1,
   'Aluno Teste C', '09/2026', 'parcela', 365, 'd2e54b74-2008-4e2a-a265-a016244ec661',
   'bab65cce-6a78-4c32-9c45-d05d78b53aa6',
   '{"ordem":1,"valor":365,"aluno_id":7777,"categoria":"parcela","competencia":"09/2026","canonical_fatura_id":"d2e54b74-2008-4e2a-a265-a016244ec661"}',
   '2026-09-15 18:57:51.663584+00'),
  ('6f4ce98e-7b0d-4adb-a855-3927b3253942', 'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6', 2,
   'Aluno Teste B', '09/2026', 'parcela', 365, null,
   'f0771e40-846b-49d2-b5fe-dc0a61b211c1',
   '{"ordem":2,"valor":365,"aluno_id":1456,"categoria":"parcela","competencia":"09/2026","canonical_fatura_id":null,"sem_vinculo_fatura":true}',
   '2026-09-15 18:57:51.663584+00'),
  ('f20b973d-5942-4989-976a-9baa1e680c38', 'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6', 3,
   'Aluno Teste A', '09/2026', 'parcela', 365, null,
   '23726ff5-ee7e-45ce-9780-dcdd6c553a80',
   '{"ordem":3,"valor":365,"aluno_id":963,"categoria":"parcela","competencia":"09/2026","canonical_fatura_id":null,"sem_vinculo_fatura":true}',
   '2026-09-15 18:57:51.663584+00');

create temporary table fixture_mov_before as
select id, to_jsonb(m) - 'fatura_id' - 'updated_at' as core
from public.caixa_movimentacoes m
where id in (
  'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
  '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
);

create temporary table fixture_caixa_before as
select id, to_jsonb(c) - 'updated_at' as core
from public.caixas_diarios c
where id = '69e56cba-5597-4d30-86b5-5121f7729eb9';

create temporary table fixture_lote_before as
select id, to_jsonb(li) as core
from public.sol_caixa_lote_itens_v1 li
where lote_id = 'dec101b6-ce9e-4cd5-bf11-73b6bcc335a6';

\ir ../../supabase/migrations/20260915202000_reparar_vinculos_faturas_lote_barra_20260915.sql

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from (values
    ('f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid, '38c0478a-9d15-42b4-b56e-bdfec424b675'::uuid),
    ('23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid, '794fae0b-5075-484b-ae18-94016717d0d0'::uuid)
  ) e(movimentacao_id, fatura_id)
  join public.caixa_movimentacoes m on m.id = e.movimentacao_id
  where m.fatura_id = e.fatura_id;
  if v_count <> 2 then raise exception 'ensaio: reparo nao vinculou 2 de 2'; end if;

  if exists (
    select 1 from fixture_mov_before b
    join public.caixa_movimentacoes m on m.id = b.id
    where b.core is distinct from (to_jsonb(m) - 'fatura_id' - 'updated_at')
  ) then raise exception 'ensaio: reparo alterou campo financeiro alheio'; end if;

  if exists (
    select 1 from fixture_caixa_before b
    join public.caixas_diarios c on c.id = b.id
    where b.core is distinct from (to_jsonb(c) - 'updated_at')
  ) then raise exception 'ensaio: reparo alterou o caixa'; end if;

  if exists (
    select 1 from fixture_lote_before b
    join public.sol_caixa_lote_itens_v1 li on li.id = b.id
    where b.core is distinct from to_jsonb(li)
  ) then raise exception 'ensaio: reparo alterou o snapshot do lote'; end if;

  select count(*) into v_count
  from public.audit_log a
  where a.tabela = 'caixa_movimentacoes'
    and a.acao = 'UPDATE'
    and a.registro_id_text in (
      'f0771e40-846b-49d2-b5fe-dc0a61b211c1',
      '23726ff5-ee7e-45ce-9780-dcdd6c553a80'
    )
    and a.dados_antigos->>'fatura_id' is null
    and a.dados_novos->>'fatura_id' is not null;
  if v_count <> 2 then raise exception 'ensaio: auditoria nao registrou 2 updates do reparo'; end if;
end
$$;

-- Segunda aplicacao precisa ser no-op depois de revalidar todas as ancoras.
\ir ../../supabase/migrations/20260915202000_reparar_vinculos_faturas_lote_barra_20260915.sql

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.audit_log
  where tabela = 'caixa_movimentacoes'
    and acao = 'UPDATE'
    and registro_id_text in (
      'f0771e40-846b-49d2-b5fe-dc0a61b211c1',
      '23726ff5-ee7e-45ce-9780-dcdd6c553a80'
    );
  if v_count <> 2 then raise exception 'ensaio: segunda aplicacao nao foi no-op'; end if;
end
$$;

\ir ../../supabase/rollbacks/20260915202000_reparar_vinculos_faturas_lote_barra_20260915_ROLLBACK.sql

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.caixa_movimentacoes
  where id in (
    'f0771e40-846b-49d2-b5fe-dc0a61b211c1'::uuid,
    '23726ff5-ee7e-45ce-9780-dcdd6c553a80'::uuid
  ) and fatura_id is null;
  if v_count <> 2 then raise exception 'ensaio: rollback nao restaurou 2 nulos'; end if;

  if exists (
    select 1 from fixture_mov_before b
    join public.caixa_movimentacoes m on m.id = b.id
    where b.core is distinct from (to_jsonb(m) - 'fatura_id' - 'updated_at')
  ) then raise exception 'ensaio: rollback alterou campo financeiro alheio'; end if;

  if exists (
    select 1 from fixture_caixa_before b
    join public.caixas_diarios c on c.id = b.id
    where b.core is distinct from (to_jsonb(c) - 'updated_at')
  ) then raise exception 'ensaio: rollback alterou o caixa'; end if;

  if exists (
    select 1 from fixture_lote_before b
    join public.sol_caixa_lote_itens_v1 li on li.id = b.id
    where b.core is distinct from to_jsonb(li)
  ) then raise exception 'ensaio: rollback alterou o snapshot do lote'; end if;

  select count(*) into v_count
  from public.audit_log a
  where a.tabela = 'caixa_movimentacoes'
    and a.acao = 'UPDATE'
    and a.registro_id_text in (
      'f0771e40-846b-49d2-b5fe-dc0a61b211c1',
      '23726ff5-ee7e-45ce-9780-dcdd6c553a80'
    );
  if v_count <> 4 then raise exception 'ensaio: auditoria nao registrou reparo + rollback'; end if;
end
$$;

-- Segunda reversao tambem precisa ser no-op.
\ir ../../supabase/rollbacks/20260915202000_reparar_vinculos_faturas_lote_barra_20260915_ROLLBACK.sql

do $$
declare v_count integer;
begin
  select count(*) into v_count
  from public.audit_log
  where tabela = 'caixa_movimentacoes'
    and acao = 'UPDATE'
    and registro_id_text in (
      'f0771e40-846b-49d2-b5fe-dc0a61b211c1',
      '23726ff5-ee7e-45ce-9780-dcdd6c553a80'
    );
  if v_count <> 4 then raise exception 'ensaio: segunda reversao nao foi no-op'; end if;
end
$$;

rollback;

\echo 'ensaio reparo vinculos Barra: 2/2, idempotencia e rollback verdes'
