-- Recriar funcao reabre EXECUTE para PUBLIC/anon por causa do
-- ALTER DEFAULT PRIVILEGES do schema public (regra ja documentada no CLAUDE.md).
-- A base_v131 e SECURITY DEFINER e so deve ser chamada pelo wrapper de topo.
-- ACL correta apos este revoke: {postgres=X, authenticated=X, service_role=X}.
revoke execute on function public.get_kpis_alunos_canonicos_base_v131(uuid, integer, integer, jsonb) from public;
revoke execute on function public.get_kpis_alunos_canonicos_base_v131(uuid, integer, integer, jsonb) from anon;
