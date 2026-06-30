-- ============================================================================
-- P09D - Hardening de permissoes dos snapshots mensais
-- Projeto alvo: ouqwbbermlzqqvtqwlul
--
-- Objetivo:
-- - Garantir que usuarios autenticados comuns possam apenas ler snapshots.
-- - Manter escrita de fechamento restrita a service_role/RPC guardada.
--
-- Nao faz:
-- - Nao grava snapshot.
-- - Nao altera dados de negocio.
-- ============================================================================

REVOKE ALL ON TABLE public.fechamento_mensal_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.fechamento_mensal_auditoria FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.fechamento_mensal_snapshots TO authenticated, service_role;
GRANT SELECT ON TABLE public.fechamento_mensal_auditoria TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON TABLE public.fechamento_mensal_snapshots TO service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.fechamento_mensal_auditoria TO service_role;
