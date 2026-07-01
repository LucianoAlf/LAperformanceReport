-- Auditoria de segurança 2026-06-30 — C1: funções SECURITY DEFINER que executam
-- SQL arbitrário, expostas ao role `anon` (sem login).
-- Ver docs/auditoria-seguranca-2026-06-30.md
--
-- Risco: SECURITY DEFINER ignora RLS; os filtros internos só barram escrita,
-- não leitura. Um anônimo poderia rodar `SELECT * FROM usuarios` / tokens.
-- Chamadores reais: edges bi-agent-lamusic e auditor-divergencias-emusys
-- (service_role) + BiAgentMetrics.tsx (front, authenticated, só execute_bi_query_lamusic).
--
-- service_role tem BYPASSRLS e não é afetado por REVOKE. Reversível via GRANT.

-- 4 funções usadas SÓ por edges (service_role): fechar para todos os demais.
REVOKE EXECUTE ON FUNCTION public.exec_readonly_sql(text)            FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.executar_query_readonly(text)      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.executar_query_auditoria(text)     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.introspect_schema_lamusic(text[])  FROM anon, authenticated, public;

-- Chamada pelo front logado (BiAgentMetrics): fechar só p/ anon, manter authenticated.
REVOKE EXECUTE ON FUNCTION public.execute_bi_query_lamusic(text, uuid, integer) FROM anon, public;
