-- Complemento da migration anterior. `revoke ... from public` NAO basta:
-- o projeto tem ALTER DEFAULT PRIVILEGES no schema public concedendo EXECUTE
-- em funcoes novas para `anon`, entao toda funcao recriada nasce aberta ao
-- usuario anonimo. Precisa de um revoke NOMINAL a anon depois do CREATE.
--
-- ACL alvo (identica a de antes do DROP/CREATE):
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
revoke execute on function public.get_agenda_dia(date, uuid) from anon;
