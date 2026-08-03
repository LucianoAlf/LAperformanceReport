-- Fecha escrita na view criada em 20260803170725.
--
-- ⚠️ O projeto tem ALTER DEFAULT PRIVILEGES no schema public concedendo TUDO a
-- `authenticated` em relacao nova. Ja e conhecido para FUNCOES (ver CLAUDE.md);
-- vale igual para VIEWS. Resultado: vw_disciplinas_modalidade nasceu com
-- authenticated=arwdDxtm, e `grant select` depois nao tira o resto.
--
-- Isso era grave aqui: a view e simples (um SELECT de uma tabela, sem join nem
-- agregacao), logo AUTO-ATUALIZAVEL, e foi criada com security_invoker = false.
-- Escrita atraves dela executaria com os direitos do DONO — ou seja, qualquer
-- usuario autenticado poderia INSERT/UPDATE/DELETE em
-- emusys_disciplinas_catalogo, que tem RLS sem policy justamente para ninguem
-- escrever. `revoke all` + `grant select` fecha.

revoke all on public.vw_disciplinas_modalidade from public, anon, authenticated;
grant select on public.vw_disciplinas_modalidade to authenticated, service_role;
