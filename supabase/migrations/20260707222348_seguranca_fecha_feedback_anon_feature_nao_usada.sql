-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Feature de feedback de professor (link publico /feedback/:token) nunca foi usada
-- (1 sessao de teste 14/02, 0 feedbacks). Remove as 2 policies anon.
-- Lado logado (modal Enviar Feedback em Sucesso do Aluno) segue via policy 'authenticated'.
-- Se reativar o link publico: mover gravacao p/ edge service_role antes.

DROP POLICY IF EXISTS "Public can read sessions by token" ON public.aluno_feedback_sessoes;
DROP POLICY IF EXISTS "Public can insert feedback via session" ON public.aluno_feedback_professor;
