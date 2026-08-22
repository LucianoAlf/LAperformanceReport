-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


GRANT EXECUTE ON FUNCTION public.auditar_saude_conversas() TO sol_acesso_restrito;
GRANT EXECUTE ON FUNCTION public.get_cron_health() TO sol_acesso_restrito;
