-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

revoke execute on function public.fabio_preferencias_professor(integer) from authenticated;
revoke execute on function public.fn_fabio_pode_notificar(integer,timestamptz) from authenticated;
