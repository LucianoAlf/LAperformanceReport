-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Remove a versão antiga (1 arg). A nova (uuid, text default 'novo') cobre as duas chamadas.
drop function if exists public.app_confirmar_registro(uuid);
