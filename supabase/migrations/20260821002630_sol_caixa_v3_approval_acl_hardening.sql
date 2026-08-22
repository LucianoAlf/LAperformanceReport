-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

revoke execute on function public.sol_caixa_shadow_registrar_approval(jsonb) from public;
revoke execute on function public.sol_caixa_shadow_registrar_approval(jsonb) from anon;
revoke execute on function public.sol_caixa_shadow_registrar_approval(jsonb) from authenticated;
grant execute on function public.sol_caixa_shadow_registrar_approval(jsonb) to sol_acesso_restrito;
grant execute on function public.sol_caixa_shadow_registrar_approval(jsonb) to service_role;
