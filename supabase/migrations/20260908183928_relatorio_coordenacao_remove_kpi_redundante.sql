begin;

-- O contrato V3 ja recebe do V2 a fotografia operacional da competencia de
-- referencia. A segunda chamada a get_kpis_professor_periodo_canonico_v3
-- repetia toda a cadeia de carteira, frequencia, saidas e fator de demanda
-- apenas para quatro campos de contexto. Em producao ela responde por mais de
-- 600 mil buffers por geracao e faz a RPC oscilar ao redor do timeout de 8 s.
--
-- Para o ciclo, os indicadores pedagogicos continuam vindo do snapshot do
-- ciclo. Somente o contexto operacional (turmas/carga da competencia de corte)
-- e reaproveitado do V2 que a funcao ja havia carregado.
do $migration$
declare
  v_function regprocedure :=
    'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'::regprocedure;
  v_definition text;
  v_patched text;
  v_start integer;
  v_end integer;
  v_relative_end integer;
  v_start_count integer;
  v_end_count integer;
  v_operacional_count integer;
  v_start_marker constant text :=
    'select coalesce(jsonb_agg(to_jsonb(k)), ''[]''::jsonb)';
  v_end_marker constant text := 'from kpis_professor;';
  v_old_operacional constant text := 'jsonb_array_elements(v_kpis)';
  v_new_operacional constant text := 'jsonb_each(v_operacional)';
  v_new_block constant text := E'  with base_professores as (\n'
    || E'    select value as item\n'
    || E'    from jsonb_array_elements(coalesce(v_base->''professores'', ''[]''::jsonb))\n'
    || E'    where nullif(value->>''professor_id'', '''') is not null\n'
    || E'  )\n'
    || E'  select coalesce(\n'
    || E'    jsonb_object_agg(\n'
    || E'      item->>''professor_id'',\n'
    || E'      coalesce(item->''operacional'', ''{}''::jsonb)\n'
    || E'    ),\n'
    || E'    ''{}''::jsonb\n'
    || E'  )\n'
    || E'  into v_operacional\n'
    || E'  from base_professores;';
begin
  select pg_get_functiondef(v_function::oid) into v_definition;

  if v_definition is null then
    raise exception 'RELATORIO_COORDENACAO_KPI_PATCH_FUNCAO_AUSENTE';
  end if;

  -- A funcao historica foi publicada a partir de Windows e preserva CRLF no
  -- corpo armazenado. Normalizar somente o texto recompilado torna a guarda
  -- independente da plataforma, sem mudar a semantica da funcao.
  v_definition := replace(v_definition, E'\r\n', E'\n');

  v_start_count := (length(v_definition) - length(replace(v_definition, v_start_marker, '')))
    / length(v_start_marker);
  v_end_count := (length(v_definition) - length(replace(v_definition, v_end_marker, '')))
    / length(v_end_marker);
  v_operacional_count := (length(v_definition) - length(replace(v_definition, v_old_operacional, '')))
    / length(v_old_operacional);

  if v_start_count <> 1 or v_end_count <> 1 or v_operacional_count <> 2 then
    raise exception 'RELATORIO_COORDENACAO_KPI_PATCH_DIVERGENTE'
      using detail = format(
        'inicio=%s fim=%s operacional=%s',
        v_start_count,
        v_end_count,
        v_operacional_count
      );
  end if;

  v_start := strpos(v_definition, v_start_marker);
  v_relative_end := strpos(substr(v_definition, v_start), v_end_marker);
  v_end := v_start - 1 + v_relative_end + length(v_end_marker);

  v_patched := substr(v_definition, 1, v_start - 1)
    || v_new_block
    || substr(v_definition, v_end);
  v_patched := replace(v_patched, v_old_operacional, v_new_operacional);

  if strpos(v_patched, 'get_kpis_professor_periodo_canonico_v3(') > 0
     or strpos(v_patched, 'jsonb_array_elements(v_kpis)') > 0 then
    raise exception 'RELATORIO_COORDENACAO_KPI_PATCH_INCOMPLETO';
  end if;

  execute v_patched;
end;
$migration$;

comment on function public.montar_relatorio_coordenacao_payload_v3(
  uuid, integer, integer, text
) is
  'Produtor dos relatorios da Coordenacao: Health Score vem do snapshot mensal/ciclo; contexto operacional reutiliza a competencia de corte ja carregada pelo V2, sem repetir a RPC ampla de KPIs.';

commit;
