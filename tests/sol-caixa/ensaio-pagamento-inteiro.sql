-- Ensaio do pagamento inteiro (N alunos × N faturas). FAIL-STOP.
--
--   psql "$DSN" -v ON_ERROR_STOP=1 -f tests/sol-caixa/ensaio-pagamento-inteiro.sql
--   echo $?      # 0 = passou · != 0 = falhou
--
-- 🔴 A VERSÃO ANTERIOR NÃO ERA UM ENSAIO — era um relatório. Ela fazia um
--    SELECT com uma coluna `veredito` que escrevia `*** FALHOU ***`, e o psql
--    saía com código 0 do mesmo jeito. Ou seja: entraria verde em qualquer CI,
--    com todas as verificações erradas. O Alfredo pegou isso, e é o tipo de
--    defeito pior que não ter teste — dá a sensação de cobertura.
--    Agora toda divergência entra em `v_falhas` e o bloco termina em
--    `raise exception`, que faz o psql sair != 0.
--
-- ⚠️ ACUMULA as falhas em vez de morrer na primeira: descobrir os 9 problemas
--    numa rodada vale mais que descobrir um por vez.
--
-- ⚠️ NÃO DEPENDE DE NOME DE ALUNO. A versão anterior fixava "Davi Guilherme" e
--    "Thuanny": funcionava no banco de produção de hoje e em nenhum outro, e
--    envelheceria junto com as faturas. Aqui os casos são DESCOBERTOS a partir
--    do próprio envelope; fixture ausente é `raise`, nunca "passou".
--
-- ⚠️ SOMENTE LEITURA. Nada aqui escreve. A prova de atomicidade do lote, que
--    escreve, mora em `ensaio-lote-atomicidade.sql` e exige banco isolado.

\set ON_ERROR_STOP on
\timing off

do $ensaio$
declare
  v_unidade    uuid;
  v_as_of      date := (now() at time zone 'America/Sao_Paulo')::date;
  v_env        jsonb;
  v_falhas     text[] := '{}';
  v_checks     int := 0;

  v_sid_multi  text;   -- aluno com 2+ faturas na competência
  v_nome_multi text;
  v_soma_multi numeric;
  v_sid_uni    text;   -- aluno com exatamente 1
  v_nome_uni   text;
  v_valor_uni  numeric;
  v_primeiro   text;   -- primeiro nome compartilhado por 2+ alunos
  v_homonimos  int;

  v_r          jsonb;
  v_n          int;

begin
  ------------------------------------------------------------------ 0) fixture
  select u.id into v_unidade
    from unidades u
   where exists (select 1 from alunos a where a.unidade_id = u.id
                   and a.status ilike 'ativo%')
   order by (select count(*) from alunos a where a.unidade_id = u.id) desc
   limit 1;
  if v_unidade is null then
    raise exception 'FIXTURE AUSENTE: nenhuma unidade com alunos ativos';
  end if;

  v_env := public.sol_faturas_alunos_v1(
    v_unidade, extract(year from v_as_of)::int, extract(month from v_as_of)::int,
    'janela_3', 'todas', v_as_of);
  if coalesce(v_env->>'status','') not in ('ok','partial') then
    raise exception 'FIXTURE AUSENTE: envelope de faturas indisponivel (status=%)',
      coalesce(v_env->>'status','<nulo>');
  end if;

  -- aluno com 2+ parcelas PAGAS na competência (caso composto)
  -- A fixture composta precisa ser uma entrada ACEITA pelo resolvedor atual.
  -- Contar 2+ faturas no envelope nao basta: um mesmo nome pode ter historico
  -- adicional, colisao ou outra regra canonica que faça o valor declarado ser
  -- recusado. Antes, a escolha dependia da ordem do planner e o mesmo codigo
  -- ficava verde ou vermelho conforme o catalogo ganhava uma migration nova.
  -- O ensaio agora escolhe uma testemunha que satisfaz o proprio contrato que
  -- sera exercitado abaixo; ausencia dela continua sendo falha alta.
  select x.sid, x.soma, a.nome into v_sid_multi, v_soma_multi, v_nome_multi
    from (select agregado.*
            from (select i->>'emusys_student_id' as sid,
                         count(*) as n,
                         sum(coalesce(nullif(i->'valores'->>'valor_pago','')::numeric,
                                      nullif(i->'valores'->>'valor_hoje','')::numeric,0)) as soma
                    from jsonb_array_elements(v_env->'items') i
                   where coalesce(i->>'tipo_fatura','') = 'parcela'
                     and coalesce(i->>'status','') = 'paga'
                     and nullif(i->>'emusys_student_id','') is not null
                     -- ⚠️ SO A COMPETENCIA CORRENTE. O envelope e `janela_3`: contar a
                     --    janela inteira da 3, 6 ou 12 faturas por aluno e "exatamente
                     --    1" nunca acontece — a fixture do caso simples ficava ausente
                     --    e o ensaio abortava sem testar nada.
                     and (i->>'competencia')::date = date_trunc('month', v_as_of)::date
                   group by 1) agregado
           where agregado.n >= 2 and agregado.soma > 0
           order by agregado.n desc, agregado.soma desc
           limit 12) x
    join alunos a on a.unidade_id = v_unidade and a.emusys_student_id = x.sid
    cross join lateral (
      select public.sol_caixa_resolver_composto_aluno_env_v1(
        v_env,
        jsonb_build_object(
          'unidade_id', v_unidade,
          'aluno_nome', a.nome,
          'competencia', date_trunc('month', v_as_of)::date,
          'valor_total', x.soma
        )
      ) resultado
    ) prova
   where coalesce((prova.resultado->>'ok')::boolean, false)
     and jsonb_array_length(coalesce(prova.resultado->'itens', '[]'::jsonb)) >= 2
     and abs(coalesce((prova.resultado->>'soma_itens')::numeric, 0) - x.soma) <= 0.01
   limit 1;

  -- aluno com exatamente 1 (caso canônica/casador)
  select x.sid, x.soma into v_sid_uni, v_valor_uni
    from (select i->>'emusys_student_id' as sid,
                 count(*) as n,
                 sum(coalesce(nullif(i->'valores'->>'valor_pago','')::numeric,
                              nullif(i->'valores'->>'valor_hoje','')::numeric,0)) as soma
            from jsonb_array_elements(v_env->'items') i
           where coalesce(i->>'tipo_fatura','') = 'parcela'
             and coalesce(i->>'status','') = 'paga'
             and nullif(i->>'emusys_student_id','') is not null
             -- ⚠️ SO A COMPETENCIA CORRENTE. O envelope e `janela_3`: contar a
             --    janela inteira da 3, 6 ou 12 faturas por aluno e "exatamente
             --    1" nunca acontece — a fixture do caso simples ficava ausente
             --    e o ensaio abortava sem testar nada.
             and (i->>'competencia')::date = date_trunc('month', v_as_of)::date
           group by 1) x
   where x.n = 1 and x.soma > 0
   limit 1;

  if v_sid_multi is null or v_sid_uni is null then
    raise exception 'FIXTURE AUSENTE: preciso de 1 aluno com 2+ parcelas pagas e 1 com exatamente 1 (achei multi=% uni=%)',
      coalesce(v_sid_multi,'<nenhum>'), coalesce(v_sid_uni,'<nenhum>');
  end if;

  select a.nome into v_nome_uni from alunos a
   where a.unidade_id = v_unidade and a.emusys_student_id = v_sid_uni limit 1;
  if v_nome_multi is null or v_nome_uni is null then
    raise exception 'FIXTURE AUSENTE: emusys_student_id sem aluno correspondente na unidade';
  end if;

  -- primeiro nome compartilhado por 2+ pessoas (caso ambiguidade)
  select lower(split_part(a.nome,' ',1)), count(distinct a.nome)
    into v_primeiro, v_homonimos
    from alunos a
   where a.unidade_id = v_unidade and (a.status ilike 'ativo%' or a.status is null)
     and a.nome is not null
   group by 1
  having count(distinct a.nome) >= 2
   order by 2 desc
   limit 1;
  if v_primeiro is null then
    raise exception 'FIXTURE AUSENTE: nenhum primeiro nome compartilhado por 2+ alunos';
  end if;

  raise notice 'fixture: unidade=% | multi=% (% faturas, R$ %) | uni=% | ambiguo="%" (% homonimos)',
    v_unidade, v_nome_multi, 2, v_soma_multi, v_nome_uni, v_primeiro, v_homonimos;

  ------------------------------------------------- 1) ambiguidade é RECUSA
  v_checks := v_checks + 1;
  v_r := public.sol_caixa_resolver_pagamento_v1(
           v_unidade, jsonb_build_array(jsonb_build_object('aluno_nome', v_primeiro,
                        'valor', v_soma_multi)), v_soma_multi, null);
  if coalesce((v_r->>'ok')::boolean, false) then
    v_falhas := v_falhas || format(
      '1. ambiguidade: "%s" tem %s homonimos e a funcao devolveu ok:true (escolheu um em silencio)',
      v_primeiro, v_homonimos);
  elsif coalesce(v_r->'alunos'->0->>'motivo','') <> 'nome_ambiguo' then
    v_falhas := v_falhas || format('1. ambiguidade: esperava motivo nome_ambiguo, veio "%s"',
      coalesce(v_r->'alunos'->0->>'motivo','<nulo>'));
  end if;

  ------------------------------------------- 2) composto: N faturas, soma exata
  v_checks := v_checks + 1;
  v_r := public.sol_caixa_resolver_pagamento_itens_v1(
           v_unidade, jsonb_build_array(jsonb_build_object('aluno_nome', v_nome_multi,
                        'valor', v_soma_multi)), v_soma_multi, null);
  if not coalesce((v_r->>'ok')::boolean, false) then
    v_falhas := v_falhas || format('2. composto: esperava ok:true, veio ok:false motivo=%s',
      coalesce(v_r->>'motivo','<nulo>'));
  else
    v_n := jsonb_array_length(coalesce(v_r->'itens','[]'::jsonb));
    if v_n < 2 then
      v_falhas := v_falhas || format('2. composto: esperava 2+ linhas planas, veio %s', v_n);
    end if;

    v_checks := v_checks + 1;
    if (select count(distinct i->>'canonical_fatura_id')
          from jsonb_array_elements(v_r->'itens') i) <> v_n then
      v_falhas := v_falhas ||
        '3. composto: ha fatura REPETIDA na lista plana (pagaria duas vezes a mesma)';
    end if;

    v_checks := v_checks + 1;
    if abs(coalesce((v_r->>'soma_itens')::numeric,0) - v_soma_multi) > 0.01 then
      v_falhas := v_falhas || format('4. composto: soma %s != declarado %s',
        v_r->>'soma_itens', v_soma_multi);
    end if;

    v_checks := v_checks + 1;
    if exists (select 1 from jsonb_array_elements(v_r->'itens') i
                where i->'fatura'->>'status' is null) then
      v_falhas := v_falhas ||
        '5. composto: linha sem status de fatura — o validador do snapshot nao revalida';
    end if;

    v_checks := v_checks + 1;
    if exists (select 1 from jsonb_array_elements(v_r->'itens') i
                where coalesce(i->>'competencia','') !~ '^[0-9]{2}/[0-9]{4}$') then
      v_falhas := v_falhas || '6. composto: competencia fora do formato MM/YYYY na lista plana';
    end if;
  end if;

  --------------------------------- 7) valor declarado que nao bate = RECUSA
  v_checks := v_checks + 1;
  v_r := public.sol_caixa_resolver_pagamento_v1(
           v_unidade, jsonb_build_array(jsonb_build_object('aluno_nome', v_nome_uni,
                        'valor', v_valor_uni + 777.77)), v_valor_uni + 777.77, null);
  if coalesce((v_r->>'ok')::boolean, false) then
    v_falhas := v_falhas || format(
      '7. valor declarado: pedi R$ %s para quem tem R$ %s e a funcao devolveu ok:true',
      v_valor_uni + 777.77, v_valor_uni);
  end if;

  ------------------------------------------ 8) atomicidade: soma nao fecha
  v_checks := v_checks + 1;
  v_r := public.sol_caixa_resolver_pagamento_itens_v1(
           v_unidade, jsonb_build_array(jsonb_build_object('aluno_nome', v_nome_multi,
                        'valor', v_soma_multi)), v_soma_multi + 999, null);
  if coalesce((v_r->>'ok')::boolean, false) then
    v_falhas := v_falhas || '8. atomicidade: soma divergente do total devolveu ok:true';
  elsif coalesce(v_r->>'motivo','') <> 'soma_itens_divergente' then
    v_falhas := v_falhas || format('8. atomicidade: esperava soma_itens_divergente, veio "%s"',
      coalesce(v_r->>'motivo','<nulo>'));
  end if;

  ------------------------------------------------------ 9) ACL das funcoes
  -- 🔴 Recriar funcao reabre EXECUTE para `anon` E PARA `authenticated`: o
  --    ALTER DEFAULT PRIVILEGES do schema concede aos tres papeis. Isto ja
  --    mordeu 4x neste projeto, e a ultima foi aqui: as duas `_env_v1`
  --    nasceram executaveis por `authenticated` e o CI ficou VERDE, porque
  --    esta lista nao continha as assinaturas delas.
  --    Asserção que nao lista a funcao nova nao protege a funcao nova.
  -- ⚠️ PROVA OS QUATRO PAPEIS, nao dois: anon e authenticated NAO podem ter
  --    EXECUTE; service_role e sol_acesso_restrito PRECISAM ter. Faltar grant
  --    ao papel de servico quebra a Sol em producao — e o oposto do vazamento,
  --    mas tambem so aparece tarde.
  -- ⚠️ Papel inexistente agora FALHA, nao pula. O `exception when
  --    undefined_object` que estava aqui transformava "nao consegui medir" em
  --    silencio verde — mesma familia da guarda que passa vazia.
  v_checks := v_checks + 1;
  declare
    v_fn    text;
    v_papel text;
    v_falta text[] := '{}';
    v_sobra text[] := '{}';
    v_linha text;
  begin
    foreach v_papel in array array['anon','authenticated','service_role','sol_acesso_restrito'] loop
      if to_regrole(v_papel) is null then
        v_falhas := v_falhas || format('9. ACL: papel %s nao existe — impossivel provar', v_papel);
      end if;
    end loop;

    foreach v_fn in array array[
      'public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)',
      'public.sol_caixa_resolver_pagamento_itens_v1(uuid,jsonb,numeric,date)',
      'public.sol_caixa_resolver_composto_aluno_v1(jsonb)',
      'public.sol_caixa_parcela_canonica(uuid,text,numeric,date)',
      'public.sol_caixa_resolver_composto_aluno_env_v1(jsonb,jsonb)',
      'public.sol_caixa_parcela_canonica_env_v1(jsonb,uuid,text,numeric,date)']
    loop
      v_linha := '';
      foreach v_papel in array array['anon','authenticated','service_role','sol_acesso_restrito'] loop
        if has_function_privilege(v_papel, v_fn, 'EXECUTE') then
          v_linha := v_linha || format('%s=SIM ', v_papel);
          if v_papel in ('anon','authenticated') then
            v_sobra := v_sobra || format('%s [%s]', v_fn, v_papel);
          end if;
        else
          v_linha := v_linha || format('%s=nao ', v_papel);
          if v_papel in ('service_role','sol_acesso_restrito') then
            v_falta := v_falta || format('%s [%s]', v_fn, v_papel);
          end if;
        end if;
      end loop;
      raise notice '   ACL % -> %', v_fn, v_linha;
    end loop;

    if array_length(v_sobra,1) > 0 then
      v_falhas := v_falhas || format('9. ACL: executavel por anon/authenticated: %s',
        array_to_string(v_sobra, ', '));
    end if;
    if array_length(v_falta,1) > 0 then
      v_falhas := v_falhas || format('9. ACL: papel de servico SEM execute em: %s',
        array_to_string(v_falta, ', '));
    end if;
  end;

  ------------------------------------- 10) as cascas nao guardam regra propria
  -- Se a original voltar a ter o corpo da regra, viram duas fontes de verdade.
  v_checks := v_checks + 1;
  if pg_get_functiondef('public.sol_caixa_parcela_canonica(uuid,text,numeric,date)'::regprocedure)
       like '%sol_faturas_alunos_v1%' then
    v_falhas := v_falhas ||
      '10. DRY: sol_caixa_parcela_canonica voltou a montar o envelope — deveria delegar a _env_v1';
  end if;

  ------------------------------------------------------------------ veredito
  if array_length(v_falhas,1) > 0 then
    raise exception E'ENSAIO FALHOU — % de % verificacoes:\n  %',
      array_length(v_falhas,1), v_checks, array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'ENSAIO OK — % verificacoes, nenhuma divergencia', v_checks;
end $ensaio$;
