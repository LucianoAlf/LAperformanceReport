-- Benchmark do pagamento inteiro: 1, 2, 3, 4, 10, 20 e 40 alunos.
--
--   docker exec sol-ensaio psql -U postgres -d ensaio -f ensaio-benchmark.sql
--
-- 🔴 O QUE ESTE NUMERO É E O QUE NÃO É.
--    O container tem 2 vCPU / 2 GB e divide a máquina com a Sol; produção é uma
--    instância bem maior. Medido nos dois com o mesmo envelope:
--        produção .... 1.318 itens em 1.266 ms  →  0,96 ms/item
--        container ... 2.100 itens em 9.128 ms  →  4,35 ms/item
--    Ou seja: **o absoluto daqui não transfere para produção — é ~4,5× mais
--    lento.** O que transfere é a FORMA DA CURVA: se o custo cresce com N ou
--    não. É essa a pergunta do gate, e é a que este arquivo responde.
--
-- ⚠️ "ANTES" É MEDIDO, NÃO ESTIMADO. `ensaio_resolver_antes` é a MESMA função,
--    com `v_envelope := null` — e envelope nulo faz cada `_env_v1` construir o
--    seu, que é exatamente o comportamento anterior à migration. Não é uma
--    reimplementação do código velho; é o código novo com a otimização
--    desligada, o que elimina a chance de eu comparar coisas diferentes.
--
-- ⚠️ Repetições: 5 para N ≤ 4 e 3 para N ≥ 10. Com 3 amostras **p90 não
--    existe** — reporto mediana e PIOR caso, e digo que é isso. Inventar um p90
--    de 3 pontos seria número bonito e mentiroso.
--
-- ⚠️ O "antes" só roda até N=4: em N=40 ele levaria ~6 minutos por repetição, e
--    o ponto já está feito muito antes disso.

\set ON_ERROR_STOP on
\timing off

-- "antes": mesma função, otimização desligada
do $mk$
declare v_def text;
begin
  v_def := pg_get_functiondef(
    'public.sol_caixa_resolver_pagamento_v1(uuid,jsonb,numeric,date)'::regprocedure);
  v_def := regexp_replace(v_def,
    'v_envelope := public\.sol_faturas_alunos_v1\([^;]+\);',
    'v_envelope := null;');
  v_def := replace(v_def,
    'FUNCTION public.sol_caixa_resolver_pagamento_v1(',
    'FUNCTION public.ensaio_resolver_antes(');
  if v_def not like '%FUNCTION public.ensaio_resolver_antes(%' then
    raise exception 'benchmark: rename do "antes" nao aconteceu — abortado';
  end if;
  if v_def like '%FUNCTION public.sol_caixa_resolver_pagamento_v1(%' then
    raise exception 'benchmark: o "antes" ainda aponta para a funcao real — abortado';
  end if;
  if v_def not like '%v_envelope := null;%' then
    raise exception 'benchmark: a otimizacao nao foi desligada no "antes" — abortado';
  end if;
  execute v_def;
end $mk$;

create temporary table if not exists placar (
  variante text, n_alunos int, rep int, ms numeric);
truncate placar;

do $bench$
declare
  v_unidade uuid := '11111111-1111-1111-1111-111111111111';
  v_ns      int[] := array[1,2,3,4,10,20,40];
  v_n       int;
  v_rep     int;
  v_reps    int;
  v_itens   jsonb;
  v_t0      timestamptz;
  v_total   numeric;
begin
  foreach v_n in array v_ns loop
    -- N alunos DISTINTOS que têm fatura na competência
    select jsonb_agg(jsonb_build_object('aluno_nome', nome)), count(*)
      into v_itens, v_rep
      from (select a.nome
              from public.alunos a
             where a.unidade_id = v_unidade
               and exists (select 1 from public.emusys_faturas f
                            where f.emusys_student_id = a.emusys_student_id::bigint
                              and f.competencia = date_trunc('month', current_date)::date)
             order by a.id
             limit v_n) x;
    if v_rep < v_n then
      raise exception 'benchmark: so achei % alunos com fatura, precisava de %', v_rep, v_n;
    end if;

    v_reps := case when v_n <= 4 then 5 else 3 end;

    -- DEPOIS (envelope uma vez)
    for v_rep in 1..v_reps loop
      v_t0 := clock_timestamp();
      perform public.sol_caixa_resolver_pagamento_itens_v1(v_unidade, v_itens, null, null);
      insert into placar values ('depois', v_n, v_rep,
        extract(epoch from (clock_timestamp() - v_t0)) * 1000);
    end loop;

    -- ANTES (envelope por aluno/ramo) — só até 4, por tempo
    if v_n <= 4 then
      for v_rep in 1..v_reps loop
        v_t0 := clock_timestamp();
        perform public.ensaio_resolver_antes(v_unidade, v_itens, null, null);
        insert into placar values ('antes', v_n, v_rep,
          extract(epoch from (clock_timestamp() - v_t0)) * 1000);
      end loop;
    end if;
  end loop;
end $bench$;

select variante, n_alunos, count(*) as reps,
       round(min(ms))                                              as min_ms,
       round(percentile_cont(0.5) within group (order by ms))      as p50_ms,
       round(max(ms))                                              as pior_ms,
       round(percentile_cont(0.5) within group (order by ms) / n_alunos) as p50_por_aluno
from placar
group by variante, n_alunos
order by variante desc, n_alunos;

-- Veredito automático: o "depois" não pode crescer proporcional a N.
do $vd$
declare
  v_1  numeric;
  v_40 numeric;
  v_fator numeric;
begin
  select percentile_cont(0.5) within group (order by ms) into v_1
    from placar where variante='depois' and n_alunos=1;
  select percentile_cont(0.5) within group (order by ms) into v_40
    from placar where variante='depois' and n_alunos=40;
  v_fator := v_40 / nullif(v_1,0);
  raise notice 'depois: N=1 %ms · N=40 %ms · fator %x para 40x mais alunos',
    round(v_1), round(v_40), round(v_fator,1);
  if v_fator > 12 then
    raise exception 'BENCHMARK REPROVA: custo cresceu %x indo de 1 para 40 alunos — o envelope ainda esta sendo refeito', round(v_fator,1);
  end if;
end $vd$;

drop function if exists public.ensaio_resolver_antes(uuid, jsonb, numeric, date);
