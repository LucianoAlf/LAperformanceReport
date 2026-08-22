-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


ALTER FUNCTION auditar_saude_conversas() SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION auditar_saude_conversas() TO PUBLIC;
