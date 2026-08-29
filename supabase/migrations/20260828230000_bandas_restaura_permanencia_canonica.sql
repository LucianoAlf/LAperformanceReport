-- =============================================================================
-- Bandas: restaura a permanência CANÔNICA em bandas_kpis e banda_integrantes.
--
-- CONTEXTO (regressão, não bug novo)
-- As duas funções foram reescritas para suportar o integrante MANUAL em banda de
-- turma, mas a reescrita partiu de uma cópia anterior a três fixes já validados:
--   8eab2559  permanência = 1ª matrícula (helper banda_permanencia_meses)
--   6d1151fa  média por PESSOA distinta, não por linha de membro
--   8ea6a3ca  sem teto de 99 meses
-- As três voltaram juntas. O Dashboard passou a mostrar 8,5 meses de permanência
-- média na rede.
--
-- POR QUE O CAMPO ESTÁ ERRADO
-- alunos.tempo_permanencia_meses é POR CONTRATO e zera na renovação. Medido:
--   Vinícius Lopa (emusys_student_id 282, CG) tem 5 linhas em `alunos`; a 1ª
--     matrícula é 14/05/2018, mas as linhas novas diziam 3 e 6 meses.
--   Miguel Bittencourt (254, CG), 1ª matrícula 12/05/2018, dizia 5 e 6 meses.
-- A fonte certa já existia: banda_permanencia_meses(aluno_id) = MIN(data_matricula)
-- de todas as linhas da mesma pessoa. Ver docs/REGRAS-DE-NEGOCIO.md §5.9.
--
-- O teto de 99 meses era herança da sentinela do campo por-contrato: com a
-- permanência canônica ele cortava justamente o veterano real — o piso histórico
-- do Emusys é 2018, ou seja, ~99 meses hoje.
--
-- EFEITO MEDIDO (28/08/2026)
--   Barra         8,3 -> 30,9   (14 alunos)
--   Campo Grande 11,3 -> 39,7   (35 alunos, 4 veteranos voltaram a contar)
--   Recreio       7,1 -> 37,2   (57 alunos)
--
-- MÉTODO: replace sobre pg_get_functiondef com guarda declarando o nº esperado de
-- ocorrências. Não transcrever corpo de função grande à mão — foi assim que os
-- três fixes se perderam.
-- =============================================================================
do $$
declare
  v_def   text;
  v_novo  text;
  v_qtd   int;
  c_campo constant text := 'al.tempo_permanencia_meses';
  c_agg   constant text :=
'  agg as (
    select unidade_id, count(distinct pessoa)::int alunos, round(avg(perm) filter (where perm is not null and perm>0 and perm<99),1) perm_media
    from membros group by unidade_id
  )';
  c_agg_novo constant text :=
'  -- uma linha por PESSOA: aluno em 2 bandas não pesa 2x na média
  membros_pessoa as (select distinct unidade_id, pessoa, perm from membros),
  agg as (
    -- sem teto de 99 meses: era herança da sentinela do campo por-contrato e cortava
    -- veterano real (piso histórico do Emusys é 2018). perm>=0 inclui calouro.
    select unidade_id, count(*)::int alunos, round(avg(perm) filter (where perm is not null and perm>=0),1) perm_media
    from membros_pessoa group by unidade_id
  )';
begin
  -- ===================== bandas_kpis =====================
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='bandas_kpis';
  if v_def is null then raise exception 'bandas_kpis nao encontrada'; end if;

  v_qtd := (length(v_def) - length(replace(v_def, c_campo, ''))) / length(c_campo);
  if v_qtd <> 3 then
    raise exception 'bandas_kpis: esperava 3 ocorrencias de %, achei %', c_campo, v_qtd;
  end if;
  v_novo := replace(v_def, c_campo, 'public.banda_permanencia_meses(al.id)');

  v_qtd := (length(v_novo) - length(replace(v_novo, c_agg, ''))) / length(c_agg);
  if v_qtd <> 1 then
    raise exception 'bandas_kpis: esperava 1 bloco agg conhecido, achei %', v_qtd;
  end if;
  v_novo := replace(v_novo, c_agg, c_agg_novo);
  execute v_novo;

  -- ===================== banda_integrantes =====================
  select pg_get_functiondef(oid) into v_def
    from pg_proc where pronamespace='public'::regnamespace and proname='banda_integrantes';
  if v_def is null then raise exception 'banda_integrantes nao encontrada'; end if;

  v_qtd := (length(v_def) - length(replace(v_def, c_campo, ''))) / length(c_campo);
  if v_qtd <> 3 then
    raise exception 'banda_integrantes: esperava 3 ocorrencias de %, achei %', c_campo, v_qtd;
  end if;
  execute replace(v_def, c_campo, 'public.banda_permanencia_meses(al.id)');

  raise notice 'permanencia canonica restaurada em bandas_kpis e banda_integrantes';
end $$;

-- CREATE OR REPLACE preserva ACL, mas o schema tem ALTER DEFAULT PRIVILEGES: conferir.
do $$
declare v_ruim text;
begin
  select string_agg(p.proname, ', ') into v_ruim
  from pg_proc p
  where p.pronamespace='public'::regnamespace
    and p.proname in ('bandas_kpis','banda_integrantes')
    and array_to_string(coalesce(p.proacl,'{}'),',') ~ '(^|,)(anon|)=';
  if v_ruim is not null then
    raise exception 'ACL regrediu (anon/PUBLIC) em: %', v_ruim;
  end if;
end $$;
