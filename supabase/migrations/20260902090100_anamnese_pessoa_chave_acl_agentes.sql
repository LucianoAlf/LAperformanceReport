-- LAPE-19 / Task 1 — complemento de ACL.
--
-- O `revoke all ... from public, anon, authenticated` da migration anterior nao
-- bastou: o ALTER DEFAULT PRIVILEGES deste schema e mais amplo do que o CLAUDE.md
-- registra. Alem de anon/authenticated, ele concede SELECT em toda relacao nova a
-- quatro papeis de agente -- sol_acesso_restrito, mila_acesso_restrito,
-- fabio_agent e lia_acesso_restrito (ver pg_default_acl, defaclobjtype='r').
--
-- Medido logo apos criar a view: ela nasceu com
--   {postgres=arwdDxtm, service_role=arwdDxtm, sol_acesso_restrito=r,
--    mila_acesso_restrito=r, fabio_agent=r, lia_acesso_restrito=r, authenticated=r}
--
-- Nenhum desses agentes consome vw_aluno_pessoa_chave. Menor privilegio.
-- Resultado apos esta migration:
--   {postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r}

revoke all on public.vw_aluno_pessoa_chave from sol_acesso_restrito;
revoke all on public.vw_aluno_pessoa_chave from mila_acesso_restrito;
revoke all on public.vw_aluno_pessoa_chave from fabio_agent;
revoke all on public.vw_aluno_pessoa_chave from lia_acesso_restrito;
