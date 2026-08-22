-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================================
-- CRACHÁ DO FÁBIO — role dedicado (princípio de menor privilégio)
-- Leitura: ampla (ler é inofensivo, mantém o Fábio ágil)
-- Ação/escrita: SÓ via as RPCs dele (nenhum UPDATE/INSERT/DELETE direto)
-- Criado NOLOGIN: a senha/LOGIN é ativada na hora de conectar (não expõe segredo agora)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabio_agent') THEN
    CREATE ROLE fabio_agent NOLOGIN;
  END IF;
END $$;

-- Pode entrar no schema public
GRANT USAGE ON SCHEMA public TO fabio_agent;

-- PORTAS DE LEITURA: SELECT em todas as tabelas e views (ler não destrói)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO fabio_agent;

-- Futuras tabelas/views também já nascem legíveis (não algemar a evolução)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO fabio_agent;

-- PORTA DE AÇÃO: só a RPC de registro de aula (escrita controlada)
GRANT EXECUTE ON FUNCTION public.registrar_aula_fabio(integer, text, text, integer, text) TO fabio_agent;

-- NÃO concedido (de propósito): UPDATE, INSERT, DELETE, TRUNCATE em qualquer tabela.
-- O role nasce sem escrita direta — só age pelas RPCs que receberem GRANT EXECUTE.

COMMENT ON ROLE fabio_agent IS
  'Crachá do agente Fábio. Leitura ampla (SELECT em tabelas/views). Escrita SOMENTE via RPCs com GRANT EXECUTE (hoje: registrar_aula_fabio). Sem UPDATE/INSERT/DELETE direto.';
