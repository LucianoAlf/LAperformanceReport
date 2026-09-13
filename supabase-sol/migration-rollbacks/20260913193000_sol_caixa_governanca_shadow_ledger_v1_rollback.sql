-- Rollback do ledger SHADOW. Não toca nenhuma tabela financeira.
revoke all on function public.sol_caixa_governanca_podar_v1(integer) from service_role;
drop function if exists public.sol_caixa_governanca_podar_v1(integer);
revoke all on function public.sol_caixa_governanca_registrar_v1(jsonb) from service_role;
drop function if exists public.sol_caixa_governanca_registrar_v1(jsonb);
drop table if exists public.sol_caixa_governanca_eventos_v1;
drop table if exists public.sol_caixa_governanca_episodios_v1;
