-- CREATE OR REPLACE com lista de parametros diferente nao substitui a funcao --
-- cria um OVERLOAD novo. Sobrou a versao de 6 argumentos (orfa, ninguem chama)
-- e a de 7 nasceu com ALTER DEFAULT PRIVILEGES do schema reabrindo EXECUTE para
-- anon/authenticated (mesma armadilha ja documentada no CLAUDE.md para
-- get_agenda_dia e get_kpis_alunos_canonicos_base_v131).

drop function if exists public.aplicar_retificacao_relatorio_gerencial_retencao_v1(uuid, integer, integer, text, text, jsonb);

revoke all on function public.aplicar_retificacao_relatorio_gerencial_retencao_v1(uuid, integer, integer, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.aplicar_retificacao_relatorio_gerencial_retencao_v1(uuid, integer, integer, text, text, jsonb, boolean)
  to service_role;
