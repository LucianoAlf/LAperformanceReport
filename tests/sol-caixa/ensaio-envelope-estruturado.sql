-- PROVAS DO ORQUESTRADOR: envelope estruturado -> combinacao unica.
--
-- ⚠️ FIXTURES DESCOBERTAS DO PROPRIO ENVELOPE, nunca nome fixo — foi a licao do
--    ensaio do pagamento inteiro. E o valor sai de `valor_pago`: no ensaio (e na
--    maioria dos casos reais) a fatura ja consta `paga`, porque a ADM lanca no
--    caixa DEPOIS do sync do Emusys. Em fatura paga, `valor_hoje` e NULL.
\set ON_ERROR_STOP on
do $ens$
declare
  v_uni uuid := '11111111-1111-1111-1111-111111111111';
  v_falhas text[] := '{}';
  v_checks int := 0;
  r jsonb;
  v_aluno text; v_resp text; v_tot numeric; v_n int;
  v_amb text; v_amb_val numeric;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select a, s, n into v_aluno, v_tot, v_n from (
    select i->'aluno'->>'nome' a,
           sum(coalesce(nullif((i->'valores'->>'valor_pago')::numeric,0),
                        (i->'valores'->>'valor_hoje')::numeric)) s, count(*) n
      from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
             extract(year from v_hoje)::int, extract(month from v_hoje)::int,
             'janela_3','todas', v_hoje))->'items') i
     where coalesce((i->>'data_pagamento')::date, v_hoje) >= v_hoje - 7
     group by 1 having count(*) between 2 and 6 order by 2 desc limit 1) z;
  if v_aluno is null then raise exception 'fixture ausente: nenhum aluno multi-fatura na janela'; end if;
  raise notice 'fixture: % com % faturas, total R$ %', v_aluno, v_n, v_tot;

  -- 1) UM ALUNO, N FATURAS (dois cursos, ou passaporte+matricula+parcela)
  v_checks := v_checks + 1;
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', v_tot, 'forma', 'pix',
        'itens', jsonb_build_array(jsonb_build_object('aluno', v_aluno))));
  if not coalesce((r->>'ok')::boolean,false)
     or jsonb_array_length(coalesce(r->'itens','[]'::jsonb)) <> v_n then
    v_falhas := v_falhas || format('1. N faturas por itens: ok=%s linhas=%s esperava=%s motivo=%s',
      r->>'ok', jsonb_array_length(coalesce(r->'itens','[]'::jsonb)), v_n, r->>'motivo');
  end if;

  -- 2) O MESMO CASO PARTINDO DO PAGADOR — o caminho inverso, que faltava provar
  v_checks := v_checks + 1;
  v_resp := (sol_caixa_responsavel_aluno(v_uni, v_aluno))->>'responsavel_nome';
  if v_resp is null then
    v_falhas := v_falhas || '2. pagador: fixture sem responsavel financeiro';
  else
    r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
          'pagador', v_resp, 'valor_total', v_tot, 'forma', 'pix'));
    if not coalesce((r->>'ok')::boolean,false) then
      v_falhas := v_falhas || format('2. pagador: ok=false motivo=%s', r->>'motivo');
    elsif r->>'via' <> 'pagador' then
      v_falhas := v_falhas || format('2. pagador: via=%s, esperava pagador', r->>'via');
    end if;
  end if;

  -- 3) VALOR QUE NAO FECHA -> recusa explicita, nunca aproximacao
  v_checks := v_checks + 1;
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', v_tot + 7.77, 'forma', 'pix',
        'itens', jsonb_build_array(jsonb_build_object('aluno', v_aluno))));
  if coalesce((r->>'ok')::boolean,false) or r->>'motivo' <> 'nenhuma_combinacao_fecha' then
    v_falhas := v_falhas || format('3. valor que nao fecha: ok=%s motivo=%s', r->>'ok', r->>'motivo');
  end if;

  -- 4) COMBINACAO AMBIGUA -> PERGUNTA, nunca sorteio. Fixture: duas faturas de
  --    valor IGUAL; pedir o valor de UMA produz exatamente duas combinacoes.
  select a, v into v_amb, v_amb_val from (
    select i->'aluno'->>'nome' a,
           coalesce(nullif((i->'valores'->>'valor_pago')::numeric,0),
                    (i->'valores'->>'valor_hoje')::numeric) v
      from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
             extract(year from v_hoje)::int, extract(month from v_hoje)::int,
             'janela_3','todas', v_hoje))->'items') i
     where coalesce((i->>'data_pagamento')::date, v_hoje) >= v_hoje - 7
     group by 1,2 having count(*) >= 2 limit 1) z;
  if v_amb is null then
    raise notice '4. ambiguidade: sem fixture de duas faturas iguais — check pulado';
  else
    v_checks := v_checks + 1;
    r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
          'valor_total', v_amb_val, 'forma', 'pix',
          'itens', jsonb_build_array(jsonb_build_object('aluno', v_amb))));
    if coalesce((r->>'ok')::boolean,false) or r->>'motivo' <> 'combinacao_ambigua' then
      v_falhas := v_falhas || format('4. ambiguidade: ok=%s motivo=%s', r->>'ok', r->>'motivo');
    elsif jsonb_typeof(r->'alternativas') <> 'array' then
      v_falhas := v_falhas || '4. ambiguidade sem alternativas para perguntar';
    end if;
  end if;

  -- 5) HOMONIMO -> recusa COM a lista (defeito medido em 10/09)
  v_checks := v_checks + 1;
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', 400, 'forma', 'pix',
        'itens', jsonb_build_array(jsonb_build_object('aluno', 'alex'))));
  if r->>'motivo' <> 'nome_ambiguo' then
    v_falhas := v_falhas || format('5. homonimo: motivo=%s', r->>'motivo');
  elsif jsonb_typeof(r->'candidatos') <> 'array' or jsonb_array_length(r->'candidatos') = 0 then
    v_falhas := v_falhas || format('5. homonimo SEM candidatos (tipo=%s)', jsonb_typeof(r->'candidatos'));
  end if;

  -- 6) SEM ALUNO NEM PAGADOR -> recusa, nunca chute
  v_checks := v_checks + 1;
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object('valor_total', 100, 'forma','pix'));
  if r->>'motivo' <> 'sem_aluno_nem_pagador' then
    v_falhas := v_falhas || format('6. sem identidade: motivo=%s', r->>'motivo');
  end if;

  -- 7) A LISTA PLANA TAMBEM VOLTA COM CANDIDATOS (fix da 20260910160000)
  v_checks := v_checks + 1;
  r := sol_caixa_resolver_pagamento_itens_v1(v_uni, '[{"aluno_nome":"alex","valor":400}]'::jsonb, 400);
  if r->>'motivo' <> 'nome_ambiguo' then
    v_falhas := v_falhas || format('7. lista plana homonimo: motivo=%s', r->>'motivo');
  elsif jsonb_typeof(r->'candidatos') <> 'array' then
    v_falhas := v_falhas || format('7. lista plana SEM candidatos (tipo=%s)', jsonb_typeof(r->'candidatos'));
  end if;

  -- 8) ACL da funcao nova, na mesma regua das outras seis
  v_checks := v_checks + 1;
  if has_function_privilege('anon','public.sol_caixa_resolver_envelope_v1(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.sol_caixa_resolver_envelope_v1(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.sol_caixa_resolver_envelope_v1(uuid,jsonb)','EXECUTE')
     or not has_function_privilege('sol_acesso_restrito','public.sol_caixa_resolver_envelope_v1(uuid,jsonb)','EXECUTE') then
    v_falhas := v_falhas || '8. ACL de sol_caixa_resolver_envelope_v1 fora da regua';
  end if;

  if array_length(v_falhas,1) > 0 then
    raise exception 'ENSAIO ENVELOPE FALHOU — % de % verificacoes: %',
      array_length(v_falhas,1), v_checks, array_to_string(v_falhas, ' | ');
  end if;
  raise notice 'ENVELOPE OK — % verificacoes, nenhuma divergencia', v_checks;
end $ens$;
