-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

REVOKE EXECUTE ON FUNCTION public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
FROM anon;

GRANT EXECUTE ON FUNCTION public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
TO authenticated, service_role;
