-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


create role lume_readonly login password 'RdOnly_LAMusic_2026!xK9';
grant connect on database postgres to lume_readonly;
grant usage on schema public to lume_readonly;
grant select on all tables in schema public to lume_readonly;
alter default privileges in schema public grant select on tables to lume_readonly;
grant usage on all sequences in schema public to lume_readonly;
alter default privileges in schema public grant usage on sequences to lume_readonly;
