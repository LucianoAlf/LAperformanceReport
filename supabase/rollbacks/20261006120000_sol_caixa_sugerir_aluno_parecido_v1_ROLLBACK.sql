-- Rollback de 20261006120000_sol_caixa_sugerir_aluno_parecido_v1.sql
--
-- Função nova, só leitura, sem dependentes no banco: remover é suficiente.
-- O runtime da Sol trata a ausência dela (erro/404 da RPC) como "sem sugestão"
-- e volta exatamente à mensagem antiga ("confere o nome completo"), então este
-- rollback pode rodar com ou sem o runtime novo carregado.
drop function if exists public.sol_caixa_sugerir_aluno_parecido_v1(uuid, text);
