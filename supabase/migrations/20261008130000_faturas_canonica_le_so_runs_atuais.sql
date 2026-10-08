-- Canonica de faturas da Lista de Alunos: ler de `sync_run_items` SO as linhas das execucoes
-- atuais (uma por competencia), pelo indice por run_id que ja existe. Mesma resposta.
--
-- MEDIDO (08/10/2026, producao): `get_faturas_alunos_financeiro_v1_canonica_20260817` levava
-- ~2,4 s no Consolidado. EXPLAIN ANALYZE da consulta extraida: 1,6 s num Seq Scan de
-- `sync_run_items` (352 MB de heap, 207 mil linhas de 195 execucoes guardadas pela retencao)
-- para aproveitar ~3,4 mil linhas das 3 execucoes atuais. O planner estima muitas linhas para o
-- CTE `ultimo_run_por_competencia` (filtro de janela) e prefere varrer a tabela. Alem do tempo,
-- ler 352 MB a cada abertura da Lista empurra o resto para fora do cache (1,9 GB de RAM).
--
-- MUDANCA: um filtro redundante `i.run_id = any(array(select id from ultimo_run_por_competencia))`.
-- O ARRAY vira InitPlan de tamanho pequeno estimado e o planner usa o indice por run_id.
-- POR QUE E EQUIVALENTE: o join `i.run_id = ur.id` ja exige exatamente essa condicao; o filtro
-- so a repete numa forma que o planner sabe usar. Nenhuma coluna, regra ou ordem muda.
--
-- PROVAS (copia em pg_temp x original, antes de aplicar):
--   md5 identico em 24 de 24 (Consolidado, CG, Barra, Recreio x janela_3/competencia x
--   todas/em_atraso_d0/cobranca_d2).
--   Consolidado janela_3/todas, 3 rodadas alternando a ordem: original 2.299/2.425/2.469 ms,
--   nova 1.166/1.090/1.282 ms. Por unidade ja usava o indice: tempo igual.
--   Pos-aplicacao: original reconstruida em pg_temp x nova em producao, md5 identico.
--
-- Custo/dia: REDUZ (~1,2 s e ~350 MB de leitura a menos por chamada consolidada).
--
-- Metodo: le a definicao VIVA, troca exatamente 1 ocorrencia (guarda de contagem), confere
-- que SECURITY DEFINER, search_path, statement_timeout e ACL sobreviveram.

do $migration$
declare
  v_def text; n int;
  v_acl_antes text; v_acl_depois text;
  a constant text := E'    where i.competencia between v_inicio and v_fim\n  ),\n  classificadas';
  b constant text := E'    where i.competencia between v_inicio and v_fim\n      -- 08/10/2026: redundante com o join em ur; faz o planner usar o indice por run_id\n      -- em vez de varrer sync_run_items inteira (352 MB).\n      and i.run_id = any(array(select u2.id from ultimo_run_por_competencia u2))\n  ),\n  classificadas';
  f constant regprocedure := 'public.get_faturas_alunos_financeiro_v1_canonica_20260817(uuid,integer,integer,text,text,date)'::regprocedure;
begin
  v_acl_antes := (select proacl::text from pg_proc where oid = f);
  v_def := pg_get_functiondef(f);
  n := (length(v_def) - length(replace(v_def, a, ''))) / length(a);
  if n <> 1 then
    raise exception 'FATURAS_RUN: ancora esperada 1, achada %', n;
  end if;
  execute replace(v_def, a, b);

  v_def := pg_get_functiondef(f);
  v_acl_depois := (select proacl::text from pg_proc where oid = f);
  if position('any(array(select u2.id from ultimo_run_por_competencia u2))' in v_def) = 0 then
    raise exception 'FATURAS_RUN: filtro nao entrou';
  end if;
  if v_def not like '%SECURITY DEFINER%'
     or v_def not like '%search_path%'
     or v_def not like '%statement_timeout%' then
    raise exception 'FATURAS_RUN: perdeu configuracao da funcao';
  end if;
  if v_acl_antes is distinct from v_acl_depois then
    raise exception 'FATURAS_RUN: ACL mudou (% -> %)', v_acl_antes, v_acl_depois;
  end if;
end
$migration$;
