-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Wrapper gêmeo de sol_faturas_alunos_v1 / sol_inadimplencia_v1.
-- get_kpis_alunos_admin_operacional tem guard exigir_acesso_kpis_admin_v1 que barra a role da Sol.
-- Este wrapper eleva request.jwt.claims p/ service_role, chama a RPC canônica e restaura os claims.
create or replace function public.sol_kpis_alunos_v1(
  p_unidade_id uuid default null::uuid,
  p_ano integer default (extract(year from (now() at time zone 'America/Sao_Paulo'::text)))::integer,
  p_mes integer default (extract(month from (now() at time zone 'America/Sao_Paulo'::text)))::integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_claims_anteriores text := current_setting('request.jwt.claims', true);
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    v_result := public.get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims_anteriores, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims_anteriores, ''), true);
  return v_result;
end;
$function$;

revoke all on function public.sol_kpis_alunos_v1(uuid, integer, integer) from public;
grant execute on function public.sol_kpis_alunos_v1(uuid, integer, integer) to sol_acesso_restrito, service_role;
