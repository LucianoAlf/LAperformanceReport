-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Reinstala o contrato publico depois da funcao canonica de reconciliacao.
-- A leitura canonica continua sendo a fonte dos dados; este wrapper apenas
-- garante que todo total monetario tenha a mesma forma consumida pela UI.

alter function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) rename to get_faturas_alunos_financeiro_v1_canonica_20260817;

create function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_canonica_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );

  if jsonb_typeof(v_payload #> '{totais,canceladas}') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'contrato financeiro invalido: total de canceladas ausente';
  end if;

  return jsonb_set(
    v_payload,
    '{totais,canceladas,valor}',
    to_jsonb(0::numeric),
    true
  );
end;
$function$;

comment on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) is
  'Leitura canonica de faturas; todos os totais monetarios, inclusive canceladas, declaram quantidade e valor.';

revoke all on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) from public, anon;

grant execute on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) to authenticated, service_role;
