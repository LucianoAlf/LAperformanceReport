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
  v_soma numeric; v_nomes text[]; v_cats text[]; v_comps text[];
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


  -- ── 9) IRMAOS: pagador -> DUAS PESSOAS distintas ──────────────────────────
  -- ⚠️ O check 2 usa o mesmo aluno com varias matriculas — isso e um filho com
  --    dois cursos, NAO irmaos. Este aqui exige dois nomes diferentes.
  v_checks := v_checks + 1;
  select sum(coalesce((i->'valores'->>'valor_hoje')::numeric,
                      (i->'valores'->>'valor_pago')::numeric))
    into v_soma
    from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
           extract(year from v_hoje)::int, extract(month from v_hoje)::int,
           'janela_3','todas', v_hoje))->'items') i
   where i->'aluno'->>'nome' in ('Irmao Um 9101','Irma Dois 9102');
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'pagador', 'Responsavel Irmaos 9100', 'valor_total', v_soma, 'forma','pix'));
  if not coalesce((r->>'ok')::boolean,false) then
    v_falhas := v_falhas || format('9. irmaos: ok=false motivo=%s soma=%s', r->>'motivo', v_soma);
  else
    select array_agg(distinct x->>'aluno_nome' order by x->>'aluno_nome')
      into v_nomes from jsonb_array_elements(r->'itens') x;
    if v_nomes is distinct from array['Irma Dois 9102','Irmao Um 9101'] then
      v_falhas := v_falhas || format('9. irmaos: resolveu %s, esperava as DUAS pessoas', v_nomes::text);
    end if;
    if (r->>'via') <> 'pagador' or (r->>'alunos')::int <> 2 then
      v_falhas := v_falhas || format('9. irmaos: via=%s alunos=%s', r->>'via', r->>'alunos');
    end if;
  end if;

  -- ── 10) TRIO: parcela + Passaporte + Taxa de Matricula juntos ─────────────
  -- ⚠️ NAO EXISTE tipo `matricula` no dado: "Taxa de Matricula" e "Passaporte"
  --    compartilham `passaporte_taxa_matricula`. Sao TRES faturas de naturezas
  --    distintas e DUAS categorias — e a assercao conta as tres pela DESCRICAO,
  --    que e onde a distincao existe de verdade.
  v_checks := v_checks + 1;
  select sum(coalesce((i->'valores'->>'valor_hoje')::numeric,
                      (i->'valores'->>'valor_pago')::numeric))
    into v_soma
    from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
           extract(year from v_hoje)::int, extract(month from v_hoje)::int,
           'janela_3','todas', v_hoje))->'items') i
   where i->'aluno'->>'nome' = 'Trio Faturas 9200';
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', v_soma, 'forma','pix',
        'itens', jsonb_build_array(jsonb_build_object('aluno','Trio Faturas 9200'))));
  if not coalesce((r->>'ok')::boolean,false) or jsonb_array_length(r->'itens') <> 3 then
    v_falhas := v_falhas || format('10. trio: ok=%s linhas=%s motivo=%s',
      r->>'ok', jsonb_array_length(coalesce(r->'itens','[]'::jsonb)), r->>'motivo');
  else
    select array_agg(distinct x->>'categoria' order by x->>'categoria')
      into v_cats from jsonb_array_elements(r->'itens') x;
    if v_cats is distinct from array['parcela','passaporte'] then
      v_falhas := v_falhas || format('10. trio: categorias=%s, esperava parcela+passaporte', v_cats::text);
    end if;
    if not (exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'descricao' ilike 'Parcela%')
        and exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'descricao' ilike 'Passaporte%')
        and exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'descricao' ilike 'Taxa de Matricula%')) then
      v_falhas := v_falhas || '10. trio: as tres naturezas nao vieram todas';
    end if;
  end if;

  -- ── 11) TRES COMPETENCIAS numa tacada, com os meses EXIGIDOS ──────────────
  v_checks := v_checks + 1;
  select sum(coalesce((i->'valores'->>'valor_hoje')::numeric,
                      (i->'valores'->>'valor_pago')::numeric))
    into v_soma
    from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
           extract(year from v_hoje)::int, extract(month from v_hoje)::int,
           'janela_3','todas', v_hoje))->'items') i
   where i->'aluno'->>'nome' = 'Tres Meses 9300';
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', v_soma, 'forma','pix',
        'itens', jsonb_build_array(jsonb_build_object(
          'aluno','Tres Meses 9300',
          'competencias', jsonb_build_array(
            to_char(date_trunc('month', v_hoje - interval '2 months'),'MM/YYYY'),
            to_char(date_trunc('month', v_hoje - interval '1 month'),'MM/YYYY'),
            to_char(date_trunc('month', v_hoje),'MM/YYYY'))))));
  if not coalesce((r->>'ok')::boolean,false) or jsonb_array_length(r->'itens') <> 3 then
    v_falhas := v_falhas || format('11. tres meses: ok=%s linhas=%s motivo=%s',
      r->>'ok', jsonb_array_length(coalesce(r->'itens','[]'::jsonb)), r->>'motivo');
  else
    select array_agg(distinct x->>'competencia' order by x->>'competencia')
      into v_comps from jsonb_array_elements(r->'itens') x;
    if coalesce(array_length(v_comps,1),0) <> 3 then
      v_falhas := v_falhas || format('11. tres meses: competencias resolvidas=%s', v_comps::text);
    end if;
  end if;

  -- ── 12) O FILTRO DE CATEGORIA MORDE (senao categorias[] e enfeite) ────────
  v_checks := v_checks + 1;
  select sum(coalesce((i->'valores'->>'valor_hoje')::numeric,
                      (i->'valores'->>'valor_pago')::numeric))
    into v_soma
    from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
           extract(year from v_hoje)::int, extract(month from v_hoje)::int,
           'janela_3','todas', v_hoje))->'items') i
   where i->'aluno'->>'nome' = 'Trio Faturas 9200' and i->>'descricao' ilike 'Parcela%';
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', v_soma, 'forma','pix',
        'itens', jsonb_build_array(jsonb_build_object(
          'aluno','Trio Faturas 9200', 'categorias', jsonb_build_array('parcela')))));
  if not coalesce((r->>'ok')::boolean,false) or jsonb_array_length(r->'itens') <> 1
     or (r->'itens'->0->>'categoria') <> 'parcela' then
    v_falhas := v_falhas || format('12. filtro de categoria: ok=%s linhas=%s cat=%s motivo=%s',
      r->>'ok', jsonb_array_length(coalesce(r->'itens','[]'::jsonb)),
      r->'itens'->0->>'categoria', r->>'motivo');
  end if;


  -- ── 13) TAXA DE MATRICULA PELO CAMINHO EXPLICITO ──────────────────────────
  -- ⚠️ O check 10 pede o trio SEM filtro de categoria — prova que as tres vem
  --    juntas, nao que o recorte que o ROTEADOR vai emitir funciona. Aqui o
  --    envelope pede `categorias: ["passaporte"]`, que e o que a V4 produz para
  --    "taxa de matricula": o banco canoniza "Taxa de Matricula" e "Passaporte"
  --    no mesmo tipo, entao as DUAS tem de vir e a parcela ficar fora.
  v_checks := v_checks + 1;
  select sum(coalesce((i->'valores'->>'valor_hoje')::numeric,
                      (i->'valores'->>'valor_pago')::numeric))
    into v_soma
    from jsonb_array_elements((sol_faturas_alunos_v1(v_uni,
           extract(year from v_hoje)::int, extract(month from v_hoje)::int,
           'janela_3','todas', v_hoje))->'items') i
   where i->'aluno'->>'nome' = 'Trio Faturas 9200'
     and (i->>'descricao' ilike 'Passaporte%' or i->>'descricao' ilike 'Taxa de Matricula%');
  r := sol_caixa_resolver_envelope_v1(v_uni, jsonb_build_object(
        'valor_total', v_soma, 'forma','pix',
        'itens', jsonb_build_array(jsonb_build_object(
          'aluno','Trio Faturas 9200', 'categorias', jsonb_build_array('passaporte')))));
  if not coalesce((r->>'ok')::boolean,false) or jsonb_array_length(r->'itens') <> 2 then
    v_falhas := v_falhas || format('13. taxa de matricula explicita: ok=%s linhas=%s motivo=%s',
      r->>'ok', jsonb_array_length(coalesce(r->'itens','[]'::jsonb)), r->>'motivo');
  else
    if exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'descricao' ilike 'Parcela%') then
      v_falhas := v_falhas || '13. o filtro `passaporte` deixou entrar a PARCELA';
    end if;
    if not (exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'descricao' ilike 'Taxa de Matricula%')
        and exists (select 1 from jsonb_array_elements(r->'itens') x where x->>'descricao' ilike 'Passaporte%')) then
      v_falhas := v_falhas || '13. o filtro `passaporte` nao trouxe as duas (taxa + passaporte)';
    end if;
  end if;

  if array_length(v_falhas,1) > 0 then
    raise exception 'ENSAIO ENVELOPE FALHOU — % de % verificacoes: %',
      array_length(v_falhas,1), v_checks, array_to_string(v_falhas, ' | ');
  end if;
  raise notice 'ENVELOPE OK — % verificacoes, nenhuma divergencia', v_checks;
end $ens$;
