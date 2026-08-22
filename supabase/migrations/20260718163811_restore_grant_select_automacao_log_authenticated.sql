-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Restaura o GRANT SELECT de automacao_log para o role authenticated.
-- O GRANT foi revogado na auditoria de seguranca de 2026-06-30 (varredura de grants amplos),
-- mas automacao_log e lida DIRETO pelo frontend (aba Automacao em Alunos + pagina AutomacoesPage
-- via hook useAutomacoesData), entao o app passou a receber 42501 permission denied e a tela
-- mostrava "0 registros". A policy RLS de SELECT para authenticated (using true) ja existe e
-- estava correta; faltava apenas o GRANT base, checado pelo Postgres antes da policy.
-- Tabela irma automacao_invariantes (join embedded) ja possui o grant.
GRANT SELECT ON public.automacao_log TO authenticated;
