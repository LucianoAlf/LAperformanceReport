-- O ORQUESTRADOR QUE FALTAVA: envelope estruturado -> combinacao unica.
--
-- 🔴 POR QUE ELE EXISTE. Medido em 10/09: a ferramenta financeira sabe muito
--    mais do que a Sol consegue PEDIR. Com a pergunta certa o Core acerta
--    (Lis: 357 + 300 = 657, responsavel Gisele); com a pergunta que o parser
--    legado monta, ele recebe nome = "PG parcelas aluna Lis Dal Mora Mello
--    curso canto e curso de violao Kids CG" e valor = 357. O gargalo nao e
--    dado, e orquestracao: linguagem -> familia/aluno -> competencias -> faturas.
--
-- 🔴 AS PECAS JA EXISTIAM SOLTAS: pagador->candidatos, aluno->responsavel,
--    aluno+competencia+valor->faturas, varios alunos->varias faturas, lote
--    atomico. Faltava quem juntasse. Esta funcao junta e NAO reimplementa
--    nenhuma delas: chama sol_caixa_responsavel_aluno e
--    sol_caixa_aluno_por_responsavel para identidade, e le o MESMO envelope de
--    sol_faturas_alunos_v1. Reimplementar identidade aqui seria a segunda fonte
--    de verdade que gerou as duplicatas de renovacao.
--
-- 🔴 `alunos` E MATRICULA, NAO PESSOA, e isto quebra o caminho do pagador se
--    ninguem colapsar. Medido em 10/09: sol_caixa_aluno_por_responsavel(CG,
--    'Gisele Dalmora da Silva') devolve DOIS "alunos", ambos "Lis Dal Mora
--    Mello" (ids 1040 e 1039), porque ela faz canto e violao; e
--    sol_caixa_identificar_por_pagador marca ambiguo=true por contar 2. Sem o
--    colapso por PESSOA, uma crianca com dois cursos vira "familia" e uma
--    familia de um filho so vira "ambigua".
--
-- ⚠️ COMBINACAO UNICA OU PERGUNTA, nunca escolha silenciosa. Com o total do
--    comprovante e o universo de faturas em aberto, procura os subconjuntos que
--    fecham no CENTAVO. Um -> segue. Zero -> recusa dizendo quanto achou. Dois
--    ou mais -> devolve as alternativas para a Sol PERGUNTAR. E a mesma regra
--    que matou o `limit 1` do casador: escolher entre coisas distintas por
--    criterio alheio a pergunta e sorteio, nao decisao.
--
-- ⚠️ TETO DE 16 FATURAS, com recusa explicita acima disso. Subconjunto e 2^n;
--    16 sao 65.535 mascaras, que o Postgres resolve em milissegundos. Sem teto,
--    uma familia grande com meses acumulados derrubaria a funcao, e recusar
--    dizendo "universo grande demais" e honesto, travar nao e.
--
-- ⚠️ A SAIDA E A MESMA LISTA PLANA de sol_caixa_resolver_pagamento_itens_v1:
--    uma linha por fatura, no formato que sol_caixa_validar_multi_aluno_
--    snapshot_v1 e sol_caixa_lancar_recebimento_lote_v1 ja consomem. O caminho
--    de aprovacao V3 nao muda nada, e e o que permite testar isto sem tocar em
--    dinheiro.
--
-- ⚠️ NAO APROVA NADA. `stable`, sem escrita. O "pode" continua humano e
--    passando pelo cofre V3.

create or replace function public.sol_caixa_resolver_envelope_v1(
  p_unidade_id uuid,
  p_envelope   jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
set statement_timeout to '60s'
as $function$
declare
  v_total   numeric := nullif(p_envelope->>'valor_total','')::numeric;
  v_pagador text    := nullif(btrim(coalesce(p_envelope->>'pagador','')), '');
  v_itens   jsonb   := coalesce(p_envelope->'itens', '[]'::jsonb);
  v_as_of   date    := (now() at time zone 'America/Sao_Paulo')::date;
  v_env     jsonb;
  v_it      jsonb;
  v_r       jsonb;
  v_filtros jsonb := '[]'::jsonb;
  v_fat     jsonb;
  v_n       int;
  v_alvo    bigint;
  v_combos  int;
  v_mask    bigint;
  v_alts    jsonb;
  v_linhas  jsonb;
begin
  if v_total is null or v_total <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor_total_ausente');
  end if;

  ---------------------------------------------------------------- 1) identidade
  if jsonb_array_length(v_itens) > 0 then
    for v_it in select x from jsonb_array_elements(v_itens) x loop
      if nullif(btrim(coalesce(v_it->>'aluno','')), '') is null then
        return jsonb_build_object('ok', false, 'motivo', 'item_sem_aluno');
      end if;
      v_r := sol_caixa_responsavel_aluno(p_unidade_id, v_it->>'aluno');
      if not coalesce((v_r->>'ok')::boolean, false) then
        return jsonb_build_object('ok', false,
          'motivo', case when v_r->>'motivo' = 'ambiguo' then 'nome_ambiguo'
                         else coalesce(v_r->>'motivo', 'aluno_nao_encontrado') end,
          'aluno_nome', v_it->>'aluno',
          'candidatos', case when jsonb_typeof(v_r->'candidatos') = 'array'
                             then v_r->'candidatos' else null end);
      end if;
      v_filtros := v_filtros || jsonb_build_array(jsonb_build_object(
        'aluno', coalesce(v_r->>'aluno_nome', v_it->>'aluno'),
        'categorias', v_it->'categorias',
        'competencias', v_it->'competencias'));
    end loop;
  elsif v_pagador is not null then
    v_r := sol_caixa_aluno_por_responsavel(p_unidade_id, v_pagador);
    if not coalesce((v_r->>'ok')::boolean, false)
       or jsonb_array_length(coalesce(v_r->'alunos','[]'::jsonb)) = 0 then
      return jsonb_build_object('ok', false, 'motivo', 'pagador_nao_encontrado',
        'pagador', v_pagador);
    end if;
    select coalesce(jsonb_agg(distinct jsonb_build_object(
             'aluno', a,
             'categorias', p_envelope->'categorias',
             'competencias', p_envelope->'competencias')), '[]'::jsonb)
      into v_filtros
      from jsonb_array_elements(v_r->'alunos') x,
           lateral (select nullif(btrim(coalesce(x->>'aluno_nome','')), '') a) y
     where a is not null;
  else
    return jsonb_build_object('ok', false, 'motivo', 'sem_aluno_nem_pagador');
  end if;

  ------------------------------------------------------- 2) universo de faturas
  v_env := public.sol_faturas_alunos_v1(
    p_unidade_id, extract(year from v_as_of)::int, extract(month from v_as_of)::int,
    'janela_3', 'todas', v_as_of);

  select coalesce(jsonb_agg(jsonb_build_object(
           'ord', ord - 1, 'aluno_nome', aluno, 'valor', valor,
           'categoria', categoria, 'competencia', to_char(comp, 'MM/YYYY'),
           'canonical_fatura_id', cfid, 'descricao', descr, 'fatura', bruto)
         order by ord), '[]'::jsonb)
    into v_fat
    from (
      select row_number() over (order by comp, aluno, cfid) as ord, *
        from (
          select coalesce(i->'aluno'->>'nome', i->>'aluno') as aluno,
                 -- fatura ja paga entra pelo valor PAGO (e o que a canonica usa)
                 case when coalesce(i->>'status','') = 'paga'
                      then coalesce(nullif((i->'valores'->>'valor_pago')::numeric, 0),
                                    (i->'valores'->>'valor_hoje')::numeric)
                      else (i->'valores'->>'valor_hoje')::numeric end as valor,
                 case coalesce(i->>'tipo_fatura','')
                   when 'parcela' then 'parcela'
                   when 'passaporte_taxa_matricula' then 'passaporte'
                   when 'matricula' then 'matricula'
                   else 'outro' end                          as categoria,
                 (i->>'competencia')::date                   as comp,
                 i->>'canonical_fatura_id'                   as cfid,
                 i->>'descricao'                             as descr,
                 jsonb_build_object(
                   'canonical_fatura_id', i->>'canonical_fatura_id',
                   'descricao', i->>'descricao', 'tipo_fatura', i->>'tipo_fatura',
                   'competencia', i->>'competencia', 'status', i->>'status',
                   'data_pagamento', i->>'data_pagamento',
                   'forma_pagamento', i->'forma_pagamento',
                   'valor_pago', i->'valores'->>'valor_pago',
                   'valor_hoje', i->'valores'->>'valor_hoje') as bruto
            from jsonb_array_elements(coalesce(v_env->'items','[]'::jsonb)) i
           -- 🔴 FATURA `paga` E O CASO NORMAL, NAO EXCECAO. A ADM lanca no caixa
           --    DEPOIS de o sync do Emusys ja ter marcado a fatura como paga —
           --    esta na propria main ("fatura ja paga e o caso NORMAL"). Filtrar
           --    `status <> paga` deixaria o orquestrador cego no caso mais comum.
           --    Medido no container: 2.100 de 2.100 faturas estao `paga`.
           -- ⚠️ A JANELA DE 7 DIAS E COPIA DELIBERADA da regra da canonica
           --    (`coalesce(data_pagamento, as_of) >= as_of - 7`), para nao
           --    ressuscitar fatura quitada meses atras. E duplicacao de
           --    constante e eu sei: se a canonica mudar a janela, esta funcao
           --    fica para tras. Nao consegui derivar sem reimplementar a regra
           --    inteira, entao fica declarado aqui e coberto por ensaio.
           where coalesce(
                   case when coalesce(i->>'status','') = 'paga'
                        then coalesce(nullif((i->'valores'->>'valor_pago')::numeric, 0),
                                      (i->'valores'->>'valor_hoje')::numeric)
                        else (i->'valores'->>'valor_hoje')::numeric end, 0) > 0
             and (coalesce(i->>'status','') <> 'paga'
                  or coalesce((i->>'data_pagamento')::date, v_as_of) >= v_as_of - 7)
             and exists (
               select 1 from jsonb_array_elements(v_filtros) f
                -- 🔴 IGUALDADE EXATA, NAO `sol_nome_mesma_pessoa_v1`. Aquela
                --    funcao responde "mesmo PRIMEIRO nome" — condicao
                --    necessaria para identidade, nunca suficiente. Usada como
                --    FILTRO ela varre o universo: no ensaio, "Paula Dias 0075"
                --    puxou todas as Paula e estourou o teto de 16 com
                --    `universo_grande`. O nome aqui ja saiu canonico de
                --    `sol_caixa_responsavel_aluno` / `_aluno_por_responsavel`,
                --    que sao quem tem o direito de decidir identidade — e que
                --    RECUSAM quando ha duvida. Comparar de novo por semelhanca
                --    seria refazer a decisao delas com regra mais fraca.
                where upper(btrim(f->>'aluno'))
                    = upper(btrim(coalesce(i->'aluno'->>'nome', i->>'aluno')))
                  and (jsonb_typeof(f->'categorias') is distinct from 'array'
                       or jsonb_array_length(f->'categorias') = 0
                       or (case coalesce(i->>'tipo_fatura','')
                             when 'parcela' then 'parcela'
                             when 'passaporte_taxa_matricula' then 'passaporte'
                             when 'matricula' then 'matricula'
                             else 'outro' end)
                          in (select jsonb_array_elements_text(f->'categorias')))
                  and (jsonb_typeof(f->'competencias') is distinct from 'array'
                       or jsonb_array_length(f->'competencias') = 0
                       or to_char((i->>'competencia')::date, 'MM/YYYY')
                          in (select jsonb_array_elements_text(f->'competencias'))))
        ) w
    ) z;

  v_n := jsonb_array_length(v_fat);
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma_fatura_aberta',
      'filtros', v_filtros);
  end if;
  if v_n > 16 then
    return jsonb_build_object('ok', false, 'motivo', 'universo_grande',
      'faturas_no_universo', v_n, 'filtros', v_filtros);
  end if;

  ----------------------------------------------- 3) combinacao UNICA no centavo
  v_alvo := round(v_total * 100)::bigint;

  with f as (select (x->>'ord')::int as ord,
                    round((x->>'valor')::numeric * 100)::bigint as cent
               from jsonb_array_elements(v_fat) x),
       m as (select g::bigint as mask
               from generate_series(1, (2::numeric ^ v_n)::bigint - 1) g),
       s as (select m.mask, sum(f.cent) as tot
               from m join f on ((m.mask >> f.ord) & 1) = 1
              group by m.mask)
  select count(*)::int, min(mask) into v_combos, v_mask from s where tot = v_alvo;

  if coalesce(v_combos, 0) = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'nenhuma_combinacao_fecha',
      'valor_total', v_total,
      'soma_disponivel', (select sum((x->>'valor')::numeric)
                            from jsonb_array_elements(v_fat) x),
      'faturas', v_fat);
  end if;

  if v_combos > 1 then
    with f as (select (x->>'ord')::int as ord, x,
                      round((x->>'valor')::numeric * 100)::bigint as cent
                 from jsonb_array_elements(v_fat) x),
         m as (select g::bigint as mask
                 from generate_series(1, (2::numeric ^ v_n)::bigint - 1) g),
         s as (select m.mask, sum(f.cent) as tot
                 from m join f on ((m.mask >> f.ord) & 1) = 1
                group by m.mask),
         ok as (select mask from s where tot = v_alvo order by mask limit 3)
    select jsonb_agg(alt order by rn) into v_alts
      from (select row_number() over (order by ok.mask) as rn,
                   (select jsonb_agg(jsonb_build_object(
                      'aluno_nome', f.x->>'aluno_nome',
                      'categoria',  f.x->>'categoria',
                      'competencia',f.x->>'competencia',
                      'valor',      f.x->>'valor') order by f.ord)
                      from f where ((ok.mask >> f.ord) & 1) = 1) as alt
              from ok) y;
    return jsonb_build_object('ok', false, 'motivo', 'combinacao_ambigua',
      'combinacoes', v_combos, 'alternativas', v_alts, 'valor_total', v_total);
  end if;

  ---------------------------------------------------------- 4) lista plana unica
  select jsonb_agg(jsonb_build_object(
           'ordem', rn,
           'aluno_nome', aluno_nome,
           'responsavel_financeiro',
             (sol_caixa_responsavel_aluno(p_unidade_id, aluno_nome))->>'responsavel_nome',
           'valor', valor, 'categoria', categoria, 'competencia', competencia,
           'canonical_fatura_id', cfid, 'descricao', descr,
           'sem_vinculo_fatura', false, 'declarado_pelo_humano', false,
           'fatura', bruto) order by rn)
    into v_linhas
    from (select row_number() over (order by (x->>'ord')::int) as rn,
                 x->>'aluno_nome' as aluno_nome, (x->>'valor')::numeric as valor,
                 x->>'categoria' as categoria, x->>'competencia' as competencia,
                 x->>'canonical_fatura_id' as cfid, x->>'descricao' as descr,
                 x->'fatura' as bruto
            from jsonb_array_elements(v_fat) x
           where ((v_mask >> ((x->>'ord')::int)) & 1) = 1) w;

  return jsonb_build_object('ok', true, 'itens', v_linhas,
    'soma_itens', (select sum((i->>'valor')::numeric) from jsonb_array_elements(v_linhas) i),
    'valor_total', v_total, 'pagador', v_pagador, 'forma', p_envelope->>'forma',
    'alunos', (select count(distinct i->>'aluno_nome') from jsonb_array_elements(v_linhas) i),
    'faturas_no_universo', v_n,
    'via', case when v_pagador is not null and jsonb_array_length(v_itens) = 0
                then 'pagador' else 'itens' end);
end $function$;

revoke execute on function public.sol_caixa_resolver_envelope_v1(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.sol_caixa_resolver_envelope_v1(uuid, jsonb)
  to service_role, sol_acesso_restrito;

comment on function public.sol_caixa_resolver_envelope_v1(uuid, jsonb) is
  'Orquestrador do caixa: recebe envelope estruturado (pagador/valor_total/forma/'
  'itens[{aluno,categorias[],competencias[]}]), expande pagador->PESSOAS (colapsa '
  'matricula), reune as faturas em aberto da janela e devolve a combinacao UNICA '
  'que fecha o total no centavo. Duas combinacoes = pergunta, nunca sorteio. '
  'Saida e a mesma lista plana que o lote ja consome. Nao aprova dinheiro.';

-- ROLLBACK: drop function public.sol_caixa_resolver_envelope_v1(uuid, jsonb);
