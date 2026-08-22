-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

DO $$
DECLARE
  v_def text;
  v_old_baseline text := E'  select count(*)::integer into v_baseline_count\n    from public.sync_run_items\n    where run_id = v_baseline_run_id;';
  v_new_baseline text := E'  select count(*)::integer into v_baseline_count\n    from public.sync_run_items\n    where run_id = v_baseline_run_id\n      and source_missing is not true;';
  v_old_missing text := E'  select count(*)::integer into v_missing_count\n    from public.sync_run_items b\n    where b.run_id = v_baseline_run_id\n      and not exists (\n        select 1\n        from financeiro_sync_publish_items i\n        where i.unidade_id = b.unidade_id\n          and i.emusys_fatura_id = b.emusys_fatura_id\n      );';
  v_new_missing text := E'  select count(*)::integer into v_missing_count\n    from public.sync_run_items b\n    where b.run_id = v_baseline_run_id\n      and b.source_missing is not true\n      and not exists (\n        select 1\n        from financeiro_sync_publish_items i\n        where i.unidade_id = b.unidade_id\n          and i.emusys_fatura_id = b.emusys_fatura_id\n      );';
BEGIN
  SELECT pg_get_functiondef('public.publish_financeiro_sync_run(uuid,jsonb,jsonb,text)'::regprocedure)
    INTO v_def;
  IF v_def IS NULL
     OR position(v_old_baseline IN v_def) = 0
     OR position(v_old_missing IN v_def) = 0
     OR position(v_new_baseline IN v_def) > 0
     OR position(v_new_missing IN v_def) > 0 THEN
    RAISE EXCEPTION 'FINANCEIRO_SYNC_PATCH_PRECONDITION_FAILED';
  END IF;
  v_def := replace(v_def, v_old_baseline, v_new_baseline);
  v_def := replace(v_def, v_old_missing, v_new_missing);
  EXECUTE v_def;
END
$$;
