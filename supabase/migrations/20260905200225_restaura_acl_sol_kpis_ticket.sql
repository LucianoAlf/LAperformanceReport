-- Versao aplicada em producao: 20260905200225.
-- A migration 20260905195222 renomeou a RPC publica para envolve-la com o
-- denominador financeiro. O rename carregou o grant da Sol para a funcao-base,
-- enquanto a nova porta publica nasceu apenas para authenticated/service_role.
-- Esta correcao restaura a porta contratada e fecha a implementacao interna.

begin;

revoke all on function public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(
  uuid,
  integer,
  integer
) from public, anon, authenticated, sol_acesso_restrito;

grant execute on function public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(
  uuid,
  integer,
  integer
) to service_role;

grant execute on function public.get_kpis_alunos_canonicos(
  uuid,
  integer,
  integer
) to authenticated, service_role, sol_acesso_restrito;

do $verify$
begin
  if not has_function_privilege(
    'sol_acesso_restrito',
    'public.get_kpis_alunos_canonicos(uuid,integer,integer)',
    'execute'
  ) then
    raise exception 'TICKET_DENOMINADOR_SOL_RPC_PUBLICA_SEM_EXECUTE';
  end if;

  if has_function_privilege(
    'sol_acesso_restrito',
    'public.get_kpis_alunos_canonicos_base_ticket_denominador_v1(uuid,integer,integer)',
    'execute'
  ) then
    raise exception 'TICKET_DENOMINADOR_SOL_BASE_INTERNA_EXPOSTA';
  end if;
end;
$verify$;

commit;
