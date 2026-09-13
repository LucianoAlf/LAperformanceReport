-- Transporte de privilégio mínimo para o ledger shadow do Caixa.
--
-- Reutiliza o token opaco do control plane da Sol. A anon key apenas alcança
-- esta RPC; a função V1 e as tabelas continuam inacessíveis às roles públicas.

create or replace function public.sol_caixa_governanca_registrar_v2(
  p_token_id text,
  p_writer_token text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.sol_governanca_writer_autorizado_v1(p_token_id, p_writer_token) then
    raise exception using errcode = '42501', message = 'SOL_GOVERNANCA_WRITER_INVALIDO';
  end if;
  return public.sol_caixa_governanca_registrar_v1(p_payload);
end;
$function$;

revoke all on function public.sol_caixa_governanca_registrar_v2(text,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.sol_caixa_governanca_registrar_v2(text,text,jsonb)
  to anon, authenticated;

comment on function public.sol_caixa_governanca_registrar_v2(text,text,jsonb) is
  'Escritor estreito do ledger shadow do Caixa; autentica token opaco e delega a validação sanitizada à V1.';
