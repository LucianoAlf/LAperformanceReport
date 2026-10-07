-- supabase/migrations/20261001160000_relatorio_admin_mensal_devolve_execute_authenticated.sql
--
-- A varredura de seguranca 20260919195000 (definer_sem_porteiro_so_rotina_interna) tirou o
-- EXECUTE de authenticated de get_relatorio_admin_mensal_rico_v1, classificando-a como
-- "sem consumidor authenticated / chamada so por service_role". Errado: a edge
-- relatorio-admin-whatsapp (modo dry_run_mensal_admin, botao "Relatorio Mensal" do
-- Administrativo) chama a RPC com o cliente do PROPRIO usuario (userClient, JWT dele).
-- Desde 19/09 o relatorio administrativo mensal falhava para qualquer usuario com
-- "permission denied" — que a edge mostra como "Nao foi possivel gerar o relatorio mensal
-- desta competencia". Os envios de agosto (04/09 e 08/09) foram antes da varredura.
--
-- Nao reabre o furo que a varredura fechava: a funcao TEM porteiro. A cadeia
-- rico_v1 -> base_v3 -> base_v2 -> base_v1 chama pode_gerar_relatorio_admin_v1(unidade) e
-- recusa com ACESSO_NEGADO_RELATORIO_MENSAL quem nao tem a unidade; professor ainda e
-- barrado antes pelo porteiro do PostgREST (fn_porteiro_requisicao). Mesmo grant da
-- definicao 20260908170000. anon continua sem acesso.

revoke all on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  to authenticated, service_role;
