-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

grant usage on schema governanca to sol_acesso_restrito;
grant execute on function governanca.quem_eh(text) to sol_acesso_restrito;
grant execute on function governanca.listar_allowlist() to sol_acesso_restrito;
grant execute on function governanca.grupos_permitidos(text) to sol_acesso_restrito;
