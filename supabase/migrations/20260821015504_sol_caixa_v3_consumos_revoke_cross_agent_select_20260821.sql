-- [RECUPERADA DO HISTORICO 2026-08-22] Migration do Caixa V3 da Sol, aplicada em
-- producao via MCP/Supabase durante o desenvolvimento do V3 (15-21/08/2026) sem o
-- arquivo versionado. SQL extraido byte a byte de supabase_migrations.schema_migrations
-- (statements como aplicados). Consolidacao pedida pelo Alf em 22/08; espelho em
-- docs/sol-caixa-v3/MIGRATIONS_APLICADAS.md no repo da Sol (sol-openclaw-backup).
-- NAO REAPLICAR: ja esta no schema_migrations com esta mesma version.

revoke all on table public.sol_caixa_v3_approval_consumos_v1 from fabio_agent, lia_acesso_restrito, mila_acesso_restrito;
revoke all on table public.sol_caixa_v3_approval_consumos_v1 from public, anon, authenticated, sol_acesso_restrito, sol_caixa_readonly;
