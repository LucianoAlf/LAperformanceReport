-- A primeira versao particionada ainda materializava todas as identidades do
-- recorte antes de aplicar o filtro 1/N. Isso preservava o pico que queriamos
-- remover. Deixe o planner empurrar o predicado de particao para antes do join
-- final com aulas.

do $migration$
declare
  v_def text;
  v_ancora text := 'with identidades as materialized (';
  v_ocorrencias integer;
begin
  select pg_get_functiondef(
    'public.preparar_manifesto_reconstrucao_professor_v2(uuid,date,date,text,uuid,integer,integer)'::regprocedure
  ) into v_def;

  if position('with identidades as (' in v_def) > 0 then
    raise notice 'manifesto por particao ja permite pushdown do filtro';
    return;
  end if;

  v_ocorrencias := (
    length(v_def) - length(replace(v_def, v_ancora, ''))
  ) / length(v_ancora);

  if v_ocorrencias <> 1 then
    raise exception 'esperava uma ancora de materializacao; encontrei %', v_ocorrencias;
  end if;

  execute replace(v_def, v_ancora, 'with identidades as (');
end;
$migration$;

comment on function public.preparar_manifesto_reconstrucao_professor_v2(
  uuid, date, date, text, uuid, integer, integer
) is
  'Prepara uma particao do manifesto e permite pushdown do filtro antes do join final com aulas.';
