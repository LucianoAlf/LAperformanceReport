-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

revoke execute on function public.maria_lareport_faltas_periodo(uuid, date, date) from public;
revoke execute on function public.maria_lareport_faltas_periodo(uuid, date, date) from anon;
revoke execute on function public.maria_lareport_faltas_periodo(uuid, date, date) from authenticated;
revoke execute on function public.maria_lareport_faltas_periodo(uuid, date, date) from service_role;
grant execute on function public.maria_lareport_faltas_periodo(uuid, date, date) to maria_lareport_rpc;
