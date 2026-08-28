-- Funcoes de trigger e dispatch sao infraestrutura, nao endpoints Data API.
-- O Postgres concede EXECUTE a PUBLIC por padrao; fecha a chamada direta sem
-- alterar triggers existentes nem a porta service-only usada pelos workers.

begin;

revoke all on function public.fn_aula_alunos_emusys_casar_aluno()
  from public, anon, authenticated;
grant execute on function public.fn_aula_alunos_emusys_casar_aluno()
  to service_role;

revoke all on function public.fn_completar_origem_retificacao_presenca()
  from public, anon, authenticated;
grant execute on function public.fn_completar_origem_retificacao_presenca()
  to service_role;

revoke all on function public.fn_fabio_chama_edge(uuid)
  from public, anon, authenticated;
grant execute on function public.fn_fabio_chama_edge(uuid)
  to service_role;

revoke all on function public.trg_atualiza_projecao_por_presenca()
  from public, anon, authenticated;
grant execute on function public.trg_atualiza_projecao_por_presenca()
  to service_role;

revoke all on function public.trg_fabio_fila_dispara()
  from public, anon, authenticated;
grant execute on function public.trg_fabio_fila_dispara()
  to service_role;

commit;
