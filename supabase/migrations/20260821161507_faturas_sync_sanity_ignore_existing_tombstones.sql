-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- A sync seguinte deve medir somente ausencias novas. Itens ja marcados como
-- source_missing no baseline sao tombstones historicos e nao podem disparar a
-- mesma barreira de sanidade a cada execucao.
do $migration$
declare
  v_definition text;
  v_before_count text := E'from public.sync_run_items\n    where run_id = v_baseline_run_id;';
  v_after_count text := E'from public.sync_run_items\n    where run_id = v_baseline_run_id\n      and not coalesce(source_missing, false);';
  v_current_count text := E'from public.sync_run_items\n    where run_id = v_baseline_run_id\n      and source_missing is not true;';
  v_before_missing text := E'from public.sync_run_items b\n    where b.run_id = v_baseline_run_id\n      and not exists (\n        select 1\n        from financeiro_sync_publish_items i\n        where i.unidade_id = b.unidade_id\n          and i.emusys_fatura_id = b.emusys_fatura_id\n      );';
  v_after_missing text := E'from public.sync_run_items b\n    where b.run_id = v_baseline_run_id\n      and not coalesce(b.source_missing, false)\n      and not exists (\n        select 1\n        from financeiro_sync_publish_items i\n        where i.unidade_id = b.unidade_id\n          and i.emusys_fatura_id = b.emusys_fatura_id\n      );';
  v_current_missing text := E'from public.sync_run_items b\n    where b.run_id = v_baseline_run_id\n      and b.source_missing is not true\n      and not exists (\n        select 1\n        from financeiro_sync_publish_items i\n        where i.unidade_id = b.unidade_id\n          and i.emusys_fatura_id = b.emusys_fatura_id\n      );';
begin
  select pg_get_functiondef(
    'public.publish_financeiro_sync_run(uuid,jsonb,jsonb,text)'::regprocedure
  ) into v_definition;

  if v_definition is null then
    raise exception 'FINANCEIRO_SYNC_PATCH_GUARD: corpo esperado da funcao nao encontrado de forma unica';
  end if;

  if position(v_current_count in v_definition) > 0
    and position(v_current_missing in v_definition) > 0 then
    raise notice 'FINANCEIRO_SYNC_PATCH_ALREADY_APPLIED: tombstones ja excluidos da sanidade';
    return;
  end if;

  if (length(v_definition) - length(replace(v_definition, v_before_count, '')))
       / nullif(length(v_before_count), 0) <> 1
    or (length(v_definition) - length(replace(v_definition, v_before_missing, '')))
       / nullif(length(v_before_missing), 0) <> 1 then
    raise exception 'FINANCEIRO_SYNC_PATCH_GUARD: corpo legado esperado nao encontrado de forma unica';
  end if;

  v_definition := replace(v_definition, v_before_count, v_after_count);
  v_definition := replace(v_definition, v_before_missing, v_after_missing);
  execute v_definition;
end;
$migration$;
