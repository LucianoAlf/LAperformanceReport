-- Alinha a lista detalhada de renovacoes ao mesmo universo canonico usado
-- pelo KPI de retencao. Atividades extras (como banda) nao compoem renovacao
-- contratual e, portanto, nao podem aparecer na lista nem no total mensal.
-- Snapshots fechados permanecem imutaveis; a leitura e retificada de forma
-- deterministica a partir do id da movimentacao preservado no snapshot.

create or replace function public.filtrar_renovacoes_admin_retencao_validas_v1(
  p_itens jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_invalidos integer := 0;
  v_resultado jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then
    raise exception 'RENOVACOES_MENSAL_ESTRUTURA_INVALIDA';
  end if;

  select count(*)::integer
  into v_invalidos
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) item
  where coalesce(item->>'id', '') !~ '^[0-9]+$';

  if v_invalidos > 0 then
    raise exception 'RENOVACOES_MENSAL_DIVERGENTE';
  end if;

  select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
  into v_resultado
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
    with ordinality itens(item, ord)
  -- NULL significa que a movimentacao foi removida depois do fechamento.
  -- Nesse caso, o item assinado do snapshot continua sendo a fonte e deve ser
  -- preservado. Somente FALSE explicito comprova atividade extra.
  where public.is_movimentacao_admin_retencao_valida((item->>'id')::integer)
    is distinct from false;

  return v_resultado;
end;
$function$;

revoke all on function public.filtrar_renovacoes_admin_retencao_validas_v1(jsonb)
  from public, anon, authenticated, service_role;

alter function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  rename to montar_relatorio_admin_mensal_payload_base_v4;

revoke all on function public.montar_relatorio_admin_mensal_payload_base_v4(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_admin_mensal_payload_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_renovacoes jsonb;
  v_esperadas integer;
begin
  v_payload := public.montar_relatorio_admin_mensal_payload_base_v4(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_renovacoes := public.filtrar_renovacoes_admin_retencao_validas_v1(
    coalesce(v_payload->'renovacoes', '[]'::jsonb)
  );
  v_esperadas := nullif(v_payload#>>'{resumo,renovacoes_realizadas}', '')::integer;

  if v_esperadas is null or v_esperadas <> jsonb_array_length(v_renovacoes) then
    raise exception 'RENOVACOES_MENSAL_DIVERGENTE';
  end if;

  return jsonb_set(v_payload, '{renovacoes}', v_renovacoes, true);
end;
$function$;

revoke all on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer) is
  'Monta o mensal administrativo excluindo atividades extras pelo mesmo predicado canonico da retencao.';

alter function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  rename to get_relatorio_admin_mensal_rico_base_v2;

revoke all on function public.get_relatorio_admin_mensal_rico_base_v2(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_relatorio_admin_mensal_rico_base_v2(uuid, integer, integer)
  to service_role;

create or replace function public.get_relatorio_admin_mensal_rico_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_resultado jsonb;
  v_renovacoes jsonb;
  v_esperadas integer;
begin
  v_resultado := public.get_relatorio_admin_mensal_rico_base_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_renovacoes := public.filtrar_renovacoes_admin_retencao_validas_v1(
    coalesce(v_resultado#>'{payload,renovacoes}', '[]'::jsonb)
  );
  v_esperadas := coalesce(
    nullif(v_resultado#>>'{payload,indicadores_retencao,renovacoes_realizadas}', '')::integer,
    nullif(v_resultado#>>'{payload,resumo,renovacoes_realizadas}', '')::integer
  );

  if v_esperadas is null or v_esperadas <> jsonb_array_length(v_renovacoes) then
    raise exception 'RENOVACOES_MENSAL_DIVERGENTE';
  end if;

  return jsonb_set(
    v_resultado,
    '{payload,renovacoes}',
    v_renovacoes,
    true
  );
end;
$function$;

revoke all on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer)
  to authenticated, service_role;

comment on function public.get_relatorio_admin_mensal_rico_v1(uuid, integer, integer) is
  'Le o mensal fechado e alinha renovacoes detalhadas ao universo canonico de retencao sem alterar o snapshot.';
