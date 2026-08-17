-- O patch de contrato de canceladas precisa vir depois da leitura de
-- reconciliacao, que substitui a funcao anterior com CREATE OR REPLACE.
-- Sem este wrapper, canceladas volta a sair sem o campo monetario e o
-- adaptador bloqueia a pagina inteira em modo fail-closed.

alter function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) rename to get_faturas_alunos_financeiro_v1_reconciliacao_base;

revoke all on function public.get_faturas_alunos_financeiro_v1_reconciliacao_base(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) from public, anon, authenticated, service_role;

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
  v_payload := public.get_faturas_alunos_financeiro_v1_reconciliacao_base(
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
  'Leitura global de faturas por snapshot completo; total canceladas sempre declara valor 0.';

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
