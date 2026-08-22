-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 4 views SECURITY DEFINER -> security_invoker (RLS de quem chama) + revoke anon.
-- A mais grave: vw_aluno_sucesso_lista (vazava base de alunos toda pra anon).
ALTER VIEW public.vw_aluno_sucesso_lista   SET (security_invoker = true);
ALTER VIEW public.vw_alertas_inteligentes  SET (security_invoker = true);
ALTER VIEW public.vw_fabio_aulas_contexto  SET (security_invoker = true);
ALTER VIEW public.vw_absenteismo_aluno     SET (security_invoker = true);

REVOKE SELECT ON public.vw_aluno_sucesso_lista  FROM anon;
REVOKE SELECT ON public.vw_alertas_inteligentes FROM anon;
REVOKE SELECT ON public.vw_fabio_aulas_contexto FROM anon;
REVOKE SELECT ON public.vw_absenteismo_aluno    FROM anon;

-- 3 funcoes de escrita SECURITY DEFINER executaveis por anon: revoga EXECUTE de anon/public.
REVOKE EXECUTE ON FUNCTION public.definir_forma_pagamento_conciliacao_aluno(bigint, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.marcar_aluno_sem_instagram_conciliacao(bigint, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.resolver_conciliacao_lead_qualidade(integer, text, integer, text, text) FROM anon, public;
