-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

revoke execute on function public.get_jornada_professor_trancados(integer) from public;
revoke execute on function public.get_contagem_trancados_professores(uuid) from public;
grant execute on function public.get_jornada_professor_trancados(integer) to authenticated;
grant execute on function public.get_contagem_trancados_professores(uuid) to authenticated;
