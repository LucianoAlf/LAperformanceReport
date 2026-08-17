-- O contrato da carteira mudou de D+0 com carencia no consumidor para D+2
-- ativo dentro da propria leitura. A versao precisa subir para impedir que
-- consumidores v3 interpretem silenciosamente a nova semantica.
do $do$
begin
  if to_regprocedure('public.get_inadimplencia_canonica_v4_base(uuid,date)') is null
     and to_regprocedure('public.get_inadimplencia_canonica(uuid,date)') is not null then
    execute 'alter function public.get_inadimplencia_canonica(uuid, date) rename to get_inadimplencia_canonica_v4_base';
  end if;
end;
$do$;

create or replace function public.get_inadimplencia_canonica(
  p_unidade_id uuid default null,
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  v_result := public.get_inadimplencia_canonica_v4_base(p_unidade_id, p_as_of_date);

  if coalesce(v_result ->> 'schema_version', '') <> '3' then
    raise exception using
      errcode = '22023',
      message = 'base canonica de inadimplencia inesperada para contrato v4';
  end if;

  return jsonb_set(v_result, '{schema_version}', '4'::jsonb, true);
end;
$function$;

comment on function public.get_inadimplencia_canonica(uuid, date) is
  'Contrato v4: carteira D+2 de alunos ativos, por tres competencias; source_missing e pendencias continuam fora da cobranca.';

revoke all on function public.get_inadimplencia_canonica_v4_base(uuid, date)
  from public, anon, authenticated;
revoke all on function public.get_inadimplencia_canonica(uuid, date)
  from public, anon;
grant execute on function public.get_inadimplencia_canonica(uuid, date)
  to authenticated, service_role;
