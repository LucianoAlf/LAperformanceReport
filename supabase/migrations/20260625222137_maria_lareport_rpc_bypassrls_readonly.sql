-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

alter role maria_lareport_rpc bypassrls;
-- Segurança: a role continua sem INSERT/UPDATE/DELETE e a Maria só expõe tools nomeadas no MCP, não SQL livre.
