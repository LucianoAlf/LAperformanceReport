-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Boa prática SECURITY DEFINER: tirar o EXECUTE default de PUBLIC...
revoke execute on function governanca.quem_eh(text) from public;

-- ...e conceder acesso só ao role da Lia (aditivo p/ Lia, não toca no SELECT dela do public).
grant usage on schema governanca to lia_acesso_restrito;
grant execute on function governanca.quem_eh(text) to lia_acesso_restrito;
