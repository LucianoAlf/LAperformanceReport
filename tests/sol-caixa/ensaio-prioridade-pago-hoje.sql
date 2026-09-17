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

do $acl$
begin
  if not has_function_privilege('service_role',
       'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)','EXECUTE')
     or not has_function_privilege('sol_acesso_restrito',
       'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)','EXECUTE')
     or has_function_privilege('anon',
       'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)','EXECUTE') then
    raise exception 'ACL_CANONICA_FUTURA: privilegios divergentes';
  end if;
end $acl$;

-- A prova acima injeta um envelope pronto e, sozinha, nao exercita a casca
-- real. Este segundo ensaio simula a fonte canonica por competencia: a janela
-- corrente contem a parcela aberta; a seguinte contem a baixa antecipada.
begin;

alter function public.sol_faturas_alunos_v1(uuid,integer,integer,text,text,date)
  rename to sol_faturas_alunos_v1_real_ensaio;

create function public.sol_faturas_alunos_v1(
  p_unidade_id uuid default null,
  p_ano integer default null,
  p_mes integer default null,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default current_date
) returns jsonb
language plpgsql stable
as $mock$
declare
  v_sid text;
  v_atual date := date_trunc('month', p_as_of_date)::date;
  v_proxima date := (date_trunc('month', p_as_of_date) + interval '1 month')::date;
  v_itens jsonb := '[]'::jsonb;
begin
  select emusys_student_id into v_sid
  from public.alunos
  where unidade_id = p_unidade_id and emusys_student_id is not null
  order by id limit 1;

  if make_date(p_ano, p_mes, 1) = v_atual then
    v_itens := jsonb_build_array(jsonb_build_object(
      'canonical_fatura_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'emusys_student_id',v_sid,'tipo_fatura','parcela',
      'descricao','Parcela atual','competencia',v_atual,
      'data_vencimento',v_atual + 4,'status','aberta','data_pagamento',null,
      'cobranca',jsonb_build_object('d0',true),
      'valores',jsonb_build_object('valor_com_desconto',465,
        'valor_sem_desconto_condicional',465,'valor_hoje',476.16,'valor_pago',null)
    ));
  elsif make_date(p_ano, p_mes, 1) = v_proxima then
    v_itens := jsonb_build_array(jsonb_build_object(
      'canonical_fatura_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'emusys_student_id',v_sid,'tipo_fatura','parcela',
      'descricao','Parcela futura paga hoje','competencia',v_proxima,
      'data_vencimento',v_proxima + 4,'status','paga','data_pagamento',p_as_of_date,
      'cobranca',jsonb_build_object('d0',false),
      'valores',jsonb_build_object('valor_com_desconto',465,
        'valor_sem_desconto_condicional',465,'valor_hoje',null,'valor_pago',465)
    ));
    if current_setting('ensaio.dupla_futura', true) = '1' then
      v_itens := v_itens || jsonb_build_array(jsonb_build_object(
        'canonical_fatura_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'emusys_student_id',v_sid,'tipo_fatura','parcela',
        'descricao','Segunda futura paga hoje','competencia',v_proxima,
        'data_vencimento',v_proxima + 5,'status','paga','data_pagamento',p_as_of_date,
        'cobranca',jsonb_build_object('d0',false),
        'valores',jsonb_build_object('valor_com_desconto',465,
          'valor_sem_desconto_condicional',465,'valor_hoje',null,'valor_pago',465)
      ));
    end if;
  end if;

  return jsonb_build_object('status','ok','items',v_itens);
end;
$mock$;

do $casca$
declare
  v_unidade uuid := '11111111-1111-1111-1111-111111111111';
  v_nome text;
  v_r jsonb;
begin
  select nome into v_nome from public.alunos
  where unidade_id=v_unidade and emusys_student_id is not null order by id limit 1;

  perform set_config('ensaio.dupla_futura','0',true);
  v_r := public.sol_caixa_parcela_canonica(v_unidade,v_nome,465,current_date);
  if not coalesce((v_r->>'ok')::boolean,false)
     or v_r->>'motivo_escolha' <> 'paga_hoje_valor_exato'
     or v_r->'fatura'->>'canonical_fatura_id' <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' then
    raise exception 'CASCA_FUTURA: esperava baixa antecipada; veio %', v_r;
  end if;

  perform set_config('ensaio.dupla_futura','1',true);
  v_r := public.sol_caixa_parcela_canonica(v_unidade,v_nome,465,current_date);
  if coalesce((v_r->>'ok')::boolean,false)
     or v_r->>'motivo' <> 'fatura_paga_hoje_ambigua'
     or coalesce((v_r->>'total_candidatas')::int,0) <> 2 then
    raise exception 'CASCA_FUTURA_AMBIGUA: deveria falhar fechado; veio %', v_r;
  end if;
end $casca$;

rollback;
