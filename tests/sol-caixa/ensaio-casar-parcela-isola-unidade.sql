\set ON_ERROR_STOP on

begin;

insert into public.unidades (id, nome, codigo)
values
  ('aaaaaaaa-1111-4111-8111-111111111111', 'Unidade Escopo A', 'UEA'),
  ('bbbbbbbb-2222-4222-8222-222222222222', 'Unidade Escopo B', 'UEB');

-- O mesmo emusys_student_id em escolas diferentes e normal: o ID pertence ao
-- token da unidade. Os nomes iguais deixam a armadilha identica ao caso real.
alter table public.alunos disable trigger user;
insert into public.alunos (id, nome, unidade_id, emusys_student_id, status)
values
  (98001, 'Aluno Escopo Teste', 'aaaaaaaa-1111-4111-8111-111111111111', '518', 'ativo'),
  (98002, 'Aluno Escopo Teste', 'bbbbbbbb-2222-4222-8222-222222222222', '518', 'ativo');
alter table public.alunos enable trigger user;

alter table public.emusys_faturas disable trigger user;
insert into public.emusys_faturas (
  id, unidade_id, unidade_codigo, emusys_fatura_id, emusys_student_id,
  descricao, status, data_vencimento, competencia, valor_original,
  desconto_fixo, desconto_condicional
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-111111111111', 'UEA', 98001, 518,
   'Parcela 09/2026 da Unidade A', 'aberta', '2026-09-05', '2026-09-01', 482, 0, 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-2222-4222-8222-222222222222', 'UEB', 98002, 518,
   'Parcela 09/2026 da Unidade B', 'aberta', '2026-09-20', '2026-09-01', 492.76, 0, 0);
alter table public.emusys_faturas enable trigger user;

do $$
declare
  v_result jsonb;
begin
  v_result := public.sol_caixa_casar_parcela(
    'aaaaaaaa-1111-4111-8111-111111111111'::uuid,
    'Aluno Escopo Teste', 492.76, '09/2026'
  );

  if v_result->>'aluno_id' <> '98001' then
    raise exception 'escopo: aluno local incorreto: %', v_result;
  end if;
  if v_result->'parcela'->>'fatura_id' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'escopo: selecionou fatura de outra unidade: %', v_result;
  end if;
  if (v_result->>'parcelas_abertas')::integer <> 1 then
    raise exception 'escopo: contou abertas de outra unidade: %', v_result;
  end if;
  if coalesce((v_result->'parcela'->>'multiplas_no_mes')::boolean, true) then
    raise exception 'escopo: inventou multiplas no mes por colisao cross-unit: %', v_result;
  end if;

  -- Depois que a fatura local fica paga, o matcher legado nao pode "migrar" o
  -- aluno para a fatura ainda aberta da outra escola.
  update public.emusys_faturas
     set status = 'paga', valor_pago = 492.76, data_pagamento = '2026-09-15'
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  v_result := public.sol_caixa_casar_parcela(
    'aaaaaaaa-1111-4111-8111-111111111111'::uuid,
    'Aluno Escopo Teste', 492.76, '09/2026'
  );
  if v_result->'parcela' is distinct from 'null'::jsonb
     or (v_result->>'parcelas_abertas')::integer <> 0 then
    raise exception 'escopo: vazou fatura aberta de outra unidade apos baixa local: %', v_result;
  end if;
end
$$;

rollback;

\echo 'ensaio casar parcela: emusys_student_id isolado por unidade'
