-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Criar role de leitura para a Lia
CREATE ROLE lia_acesso_restrito WITH LOGIN PASSWORD 'liaJornada@2026' NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Acesso ao schema public
GRANT USAGE ON SCHEMA public TO lia_acesso_restrito;

-- SELECT em todas as tabelas e views atuais
GRANT SELECT ON ALL TABLES IN SCHEMA public TO lia_acesso_restrito;

-- Cobrir tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO lia_acesso_restrito;
