revoke all on function public.sol_governanca_snapshot_operacional_v1()
  from public, anon, authenticated, service_role;

do $block$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'sol_acesso_restrito') then
    execute 'revoke all on function public.sol_governanca_snapshot_operacional_v1() from sol_acesso_restrito';
  end if;
end;
$block$;

drop function if exists public.sol_governanca_snapshot_operacional_v1();
