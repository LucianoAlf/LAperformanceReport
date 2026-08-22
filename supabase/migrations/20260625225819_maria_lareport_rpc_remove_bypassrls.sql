-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 1) Tornar as 5 RPCs canônicas SECURITY DEFINER e fixar search_path
ALTER FUNCTION public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.get_kpis_consolidados(integer) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.get_kpis_evolucao_mensal(text, integer) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.get_kpis_unidade(character varying, integer) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.get_resumo_renovacoes_proximas(uuid) SECURITY DEFINER SET search_path = public;

-- 2) Remover o bypass e SELECT amplo da role restrita da Maria
ALTER ROLE maria_lareport_rpc NOBYPASSRLS;
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM maria_lareport_rpc;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM maria_lareport_rpc;
