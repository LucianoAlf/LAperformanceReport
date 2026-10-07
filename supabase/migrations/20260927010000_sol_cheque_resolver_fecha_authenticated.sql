-- Fecha o EXECUTE de authenticated no resolver de cheques (27/09/2026).
-- A RPC nasceu com grant largo por conveniencia de depuração; o handoff da Sol
-- (2026-09-27) apontou certo: ninguém autenticado chama — a Sol entra como
-- service_role/sol_acesso_restrito e a UI não usa. Lista de alunos + vínculo de
-- fatura não é dado para JWT de usuário comum. A guarda interna fica: se um dia
-- algum consumidor autenticado precisar, a decisão será explícita.

revoke execute on function public.sol_cheque_resolver_fatura_v1(uuid, text, numeric, date, text)
  from authenticated;

do $prova$
declare v_acl text;
begin
  select proacl::text into v_acl from pg_proc
   where oid = 'public.sol_cheque_resolver_fatura_v1(uuid,text,numeric,date,text)'::regprocedure;
  if v_acl ~ '(^|[{,])(anon|authenticated)=' or v_acl ~ '(^|[{,])=X' then
    raise exception 'PROVA: ACL aberta demais: %', v_acl;
  end if;
end $prova$;

notify pgrst, 'reload schema';
