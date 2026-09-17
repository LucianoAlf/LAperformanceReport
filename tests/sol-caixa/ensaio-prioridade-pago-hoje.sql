-- Regressao Barra: duas parcelas de R$ 465 na janela. A vencida de
-- setembro nao pode vencer a baixa de outubro feita no proprio dia.
-- Banco isolado apenas; a transacao termina em rollback.

\set ON_ERROR_STOP on
\timing off

begin;

do $ensaio$
declare
  v_unidade uuid := '11111111-1111-1111-1111-111111111111';
  v_as_of date := date '2026-09-17';
  v_nome text;
  v_sid text;
  v_env jsonb;
  v_r jsonb;
begin
  select nome, emusys_student_id into v_nome, v_sid
    from public.alunos
   where unidade_id = v_unidade and emusys_student_id is not null
   order by id
   limit 1;
  if v_nome is null then
    raise exception 'FIXTURE AUSENTE: aluno sintetico da unidade de ensaio';
  end if;

  v_env := jsonb_build_object(
    'status', 'ok',
    'items', jsonb_build_array(
      jsonb_build_object(
        'canonical_fatura_id', '11111111-1111-4111-8111-111111111111',
        'emusys_fatura_id', 'fixture-setembro',
        'emusys_student_id', v_sid,
        'tipo_fatura', 'parcela',
        'descricao', 'Parcela 09/2026 do curso',
        'competencia', '2026-09-01',
        'data_vencimento', '2026-09-05',
        'status', 'aberta',
        'data_pagamento', null,
        'cobranca', jsonb_build_object('d0', true),
        'forma_pagamento', null,
        'valores', jsonb_build_object(
          'valor_com_desconto', 465,
          'valor_sem_desconto_condicional', 465,
          'valor_hoje', 465,
          'valor_pago', null
        )
      ),
      jsonb_build_object(
        'canonical_fatura_id', '22222222-2222-4222-8222-222222222222',
        'emusys_fatura_id', 'fixture-outubro',
        'emusys_student_id', v_sid,
        'tipo_fatura', 'parcela',
        'descricao', 'Parcela 10/2026 do curso',
        'competencia', '2026-10-01',
        'data_vencimento', '2026-10-05',
        'status', 'paga',
        'data_pagamento', v_as_of,
        'cobranca', jsonb_build_object('d0', false),
        'forma_pagamento', jsonb_build_object('nome', 'Pix'),
        'valores', jsonb_build_object(
          'valor_com_desconto', 465,
          'valor_sem_desconto_condicional', 465,
          'valor_hoje', null,
          'valor_pago', 465
        )
      )
    )
  );

  v_r := public.sol_caixa_parcela_canonica_env_v1(v_env, v_unidade, v_nome, 465, v_as_of);
  if not coalesce((v_r->>'ok')::boolean, false)
     or v_r->>'motivo_escolha' <> 'paga_hoje_valor_exato'
     or v_r->'fatura'->>'competencia' <> '2026-10-01'
     or v_r->'fatura'->>'status' <> 'paga' then
    raise exception 'PAGA_HOJE: esperava outubro paga; veio %', v_r;
  end if;

  -- Ambiguidade continua fail-closed: duas baixas iguais no mesmo dia nao
  -- autorizam escolher uma por ordem de vencimento.
  v_env := jsonb_set(v_env, '{items}', (v_env->'items') || jsonb_build_array(
    jsonb_build_object(
      'canonical_fatura_id', '33333333-3333-4333-8333-333333333333',
      'emusys_fatura_id', 'outra-paga-hoje',
      'emusys_student_id', v_sid,
      'tipo_fatura', 'parcela',
      'descricao', 'Outra parcela paga hoje',
      'competencia', '2026-11-01',
      'data_vencimento', '2026-11-05',
      'status', 'paga',
      'data_pagamento', v_as_of,
      'cobranca', jsonb_build_object('d0', false),
      'forma_pagamento', jsonb_build_object('nome', 'Pix'),
      'valores', jsonb_build_object('valor_com_desconto', 465, 'valor_pago', 465)
    )
  ));
  v_r := public.sol_caixa_parcela_canonica_env_v1(v_env, v_unidade, v_nome, 465, v_as_of);
  if coalesce((v_r->>'ok')::boolean, false)
     or v_r->>'motivo' <> 'fatura_paga_hoje_ambigua'
     or coalesce((v_r->>'total_candidatas')::int, 0) <> 2 then
    raise exception 'AMBIGUIDADE: deveria falhar fechado com 2 candidatas; veio %', v_r;
  end if;

  raise notice 'ENSAIO OK — paga hoje vence atraso; empate entre baixas falha fechado';
end $ensaio$;

rollback;
