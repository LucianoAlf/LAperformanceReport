-- Inadimplencia canonica (v3_base): as duas buscas EXISTS correlacionadas viram IN nao
-- correlacionado (hashed subplan). Mesma resposta, sem varrer a lista de matriculas por linha.
--
-- MEDIDO (06/10/2026, producao): `get_inadimplencia_canonica_v3_base` levava ~2,0 s no
-- Consolidado MESMO com tudo em memoria (custo de CPU, nao de disco). EXPLAIN ANALYZE da
-- consulta extraida: dos 2.070 ms, 2.041 ms estavam no CTE `linhas_avaliadas`, todos em
-- SubPlans correlacionados -- o planner inlinea `linhas_ultimo_snapshot` e copia as duas
-- buscas EXISTS para 5 lugares; cada uma varre o CTE `matriculas_locais_conhecidas` (~1,8 mil
-- linhas) para CADA uma das ~3 mil linhas do snapshot (0,14-0,26 ms x 3.000 x 5).
--
-- Consumidores que ganham junto: Lista de Alunos (leitura financeira), Sol, export de contas a
-- receber (Super Folha), KPIs que leem inadimplencia -- todos passam por get_inadimplencia_canonica.
--
-- POR QUE E EQUIVALENTE:
--   EXISTS(... where mlc.x = f(i) and <guardas de nulo de i>)  ==
--   (<guardas de nulo de i> and coalesce((f(i)) in (select mlc.x ...), false))
--   * as guardas de nulo continuam na frente: quando falham, o resultado e false, igual ao EXISTS;
--   * as colunas de `matriculas_locais_conhecidas` nunca sao nulas (o proprio CTE filtra
--     `nullif(btrim(...), '') is not null`), entao o IN nunca devolve NULL; o coalesce e cinto.
--
-- PROVAS:
--   1) Linha a linha, nas execucoes mais recentes de TODAS as competencias: 19.421 faturas,
--      0 divergencias nas duas expressoes, 0 nulos novos (18.406 / 15.760 casos verdadeiros).
--   2) Saida da funcao inteira, copia em pg_temp x original: md5 identico em 12 de 12
--      (Consolidado, CG, Barra, Recreio x 3 datas).
--   3) Pos-aplicacao, original reconstruida em pg_temp x nova em producao: md5 identico 4 de 4.
--   Tempo: Consolidado 2.286 -> 93 ms; CG 621 -> 50; Barra 286 -> 43; Recreio 438 -> 46.
--   ACL {postgres, service_role}, SECURITY DEFINER e search_path preservados.
--
-- Custo/dia: REDUZ (~2 s a menos por calculo frio da inadimplencia consolidada).
--
-- ⚠️ Testado e NAO aplicado: forcar indice em `sync_run_items` na canonica de FATURAS
-- (lateral + offset 0). Saida identica, mas com cache quente ficou igual ou PIOR
-- (CG 511 -> 869 ms); o ganho so aparecia com disco frio. Fica para outra abordagem.
--
-- Metodo: le a definicao VIVA, troca exatamente 1 ocorrencia de cada bloco (guarda de
-- contagem) e confere que o EXISTS saiu.

do $migration$
declare
  v_def text; n1 int; n2 int;
  a1 constant text := E'      exists (\n        select 1\n        from matriculas_locais_conhecidas mlc\n        where mlc.unidade_id = i.unidade_id\n          and i.emusys_matricula_id is not null\n          and i.emusys_student_id is not null\n          and mlc.emusys_matricula_id = btrim(i.emusys_matricula_id::text)\n          and mlc.emusys_student_id = btrim(i.emusys_student_id::text)\n      ) as tem_matricula_exata_da_fatura,';
  b1 constant text := E'      -- 06/10/2026: IN nao correlacionado (hash montado 1x) no lugar de EXISTS por linha.\n      -- Equivalente: guardas de nulo na frente e colunas de mlc nunca nulas.\n      (\n        i.emusys_matricula_id is not null\n        and i.emusys_student_id is not null\n        and coalesce((i.unidade_id, btrim(i.emusys_matricula_id::text), btrim(i.emusys_student_id::text)) in (\n          select mlc.unidade_id, mlc.emusys_matricula_id, mlc.emusys_student_id\n          from matriculas_locais_conhecidas mlc\n        ), false)\n      ) as tem_matricula_exata_da_fatura,';
  a2 constant text := E'      exists (\n        select 1\n        from matriculas_locais_conhecidas mlc\n        join pessoas_financeiramente_atuais pfa\n          on pfa.unidade_id = mlc.unidade_id\n         and pfa.emusys_student_id = mlc.emusys_student_id\n        where mlc.unidade_id = i.unidade_id\n          and i.emusys_matricula_id is not null\n          and mlc.emusys_matricula_id = btrim(i.emusys_matricula_id::text)\n      ) as tem_dono_matricula_atual';
  b2 constant text := E'      (\n        i.emusys_matricula_id is not null\n        and coalesce((i.unidade_id, btrim(i.emusys_matricula_id::text)) in (\n          select mlc.unidade_id, mlc.emusys_matricula_id\n          from matriculas_locais_conhecidas mlc\n          join pessoas_financeiramente_atuais pfa\n            on pfa.unidade_id = mlc.unidade_id\n           and pfa.emusys_student_id = mlc.emusys_student_id\n        ), false)\n      ) as tem_dono_matricula_atual';
begin
  v_def := pg_get_functiondef('public.get_inadimplencia_canonica_v3_base(uuid,date)'::regprocedure);
  n1 := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  n2 := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
  if n1 <> 1 or n2 <> 1 then
    raise exception 'INAD_HASH: blocos esperados 1 e 1, achados % e %', n1, n2;
  end if;
  execute replace(replace(v_def, a1, b1), a2, b2);

  v_def := pg_get_functiondef('public.get_inadimplencia_canonica_v3_base(uuid,date)'::regprocedure);
  if position('exists (' || E'\n        select 1\n        from matriculas_locais_conhecidas mlc' in v_def) > 0 then
    raise exception 'INAD_HASH: EXISTS correlacionado continua na funcao';
  end if;
  if v_def not like '%SECURITY DEFINER%' and v_def not like '%search_path%' then
    raise exception 'INAD_HASH: perdeu configuracao da funcao';
  end if;
end
$migration$;
