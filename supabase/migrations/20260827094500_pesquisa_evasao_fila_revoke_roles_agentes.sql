-- A fila nasceu com SELECT para as 4 roles de agente por causa do
-- ALTER DEFAULT PRIVILEGES do schema public -- e duas delas
-- (lia_acesso_restrito, fabio_agent) tem rolbypassrls, ou seja, liam a tabela
-- inteira ignorando a policy de unidade. As tabelas irmas (pesquisa_evasao,
-- _previews, _templates) nao dao acesso a nenhuma delas: foi acidente, nao
-- decisao. Se um dia a Lia precisar, concede-se explicitamente.
revoke all on table public.pesquisa_evasao_envios_fila
  from sol_acesso_restrito, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;
