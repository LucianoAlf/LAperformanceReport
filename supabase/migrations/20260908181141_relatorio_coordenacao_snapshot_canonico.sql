begin;

-- O painel de Performance le o snapshot fechado. O relatorio estava chamando o
-- produtor de recalculo e, por isso, reaplicava a configuracao vigente, divergia
-- do painel e repetia a cadeia cara duas vezes. Este patch troca somente a fonte
-- dessas duas funcoes e preserva integralmente o corpo vigente em cada ambiente.
do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_patched text;
  v_old_call constant text := 'from public.get_health_score_professor_v3_performance(';
  v_new_call constant text := 'from public.get_health_score_professor_v3_performance_snapshot_v3(';
  v_occurrences integer;
begin
  v_function := to_regprocedure(
    'public.enriquecer_relatorio_coordenacao_v2_comparabilidade(jsonb,uuid,date)'
  );
  if v_function is null then
    raise exception 'RELATORIO_COORDENACAO_SNAPSHOT_PATCH_DIVERGENTE: funcao V2 ausente';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  v_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old_call, ''))
  ) / length(v_old_call);

  if v_occurrences <> 1 then
    raise exception
      'RELATORIO_COORDENACAO_SNAPSHOT_PATCH_DIVERGENTE: esperado 1 leitor recalculado no V2, encontrado %',
      v_occurrences;
  end if;

  v_patched := replace(v_definition, v_old_call, v_new_call);
  execute v_patched;
end;
$migration$;

do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_patched text;
  v_old_call constant text := 'from public.get_health_score_professor_v3_performance(';
  v_new_call constant text := 'from public.get_health_score_professor_v3_performance_snapshot_v3(';
  v_old_audit constant text := '''get_health_score_professor_v3_performance''';
  v_new_audit constant text := '''get_health_score_professor_v3_performance_snapshot_v3''';
  v_call_occurrences integer;
  v_audit_occurrences integer;
begin
  v_function := to_regprocedure(
    'public.montar_relatorio_coordenacao_payload_v3(uuid,integer,integer,text)'
  );
  if v_function is null then
    raise exception 'RELATORIO_COORDENACAO_SNAPSHOT_PATCH_DIVERGENTE: funcao V3 ausente';
  end if;

  select pg_get_functiondef(v_function) into v_definition;
  v_call_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old_call, ''))
  ) / length(v_old_call);
  v_audit_occurrences := (
    length(v_definition) - length(replace(v_definition, v_old_audit, ''))
  ) / length(v_old_audit);

  if v_call_occurrences <> 1 or v_audit_occurrences <> 1 then
    raise exception
      'RELATORIO_COORDENACAO_SNAPSHOT_PATCH_DIVERGENTE: V3 chamadas=%, auditoria=%',
      v_call_occurrences,
      v_audit_occurrences;
  end if;

  v_patched := replace(v_definition, v_old_call, v_new_call);
  v_patched := replace(v_patched, v_old_audit, v_new_audit);
  execute v_patched;
end;
$migration$;

comment on function public.enriquecer_relatorio_coordenacao_v2_comparabilidade(
  jsonb, uuid, date
) is
  'Enriquece o relatorio V2 com o mesmo snapshot canonico exibido no painel de Performance; nao recalcula Health Score durante a leitura.';

comment on function public.montar_relatorio_coordenacao_payload_v3(
  uuid, integer, integer, text
) is
  'Produtor interno dos relatorios da Coordenacao. Le Health Score do snapshot canonico mensal/ciclo e nao reaplica configuracao na geracao.';

commit;
