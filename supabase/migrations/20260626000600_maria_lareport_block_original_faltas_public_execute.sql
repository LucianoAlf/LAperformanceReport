-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Fechar herança via PUBLIC: Maria herdava EXECUTE da função original por PUBLIC.
revoke execute on function public.get_faltas_periodo(uuid, date, date) from public;
revoke execute on function public.get_faltas_periodo(uuid, date, date) from maria_lareport_rpc;

-- Preservar uso normal do app/Supabase nas roles padrão.
grant execute on function public.get_faltas_periodo(uuid, date, date) to anon;
grant execute on function public.get_faltas_periodo(uuid, date, date) to authenticated;
grant execute on function public.get_faltas_periodo(uuid, date, date) to service_role;
