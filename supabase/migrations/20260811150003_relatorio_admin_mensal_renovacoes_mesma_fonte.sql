-- Corrige o falso bloqueio RENOVACOES_MENSAL_DIVERGENTE.
--
-- A versao anterior de base_v2 sobrescrevia o resumo administrativo com
-- kpis_retencao do snapshot gerencial. Esse snapshot pode ter sido capturado
-- em outro instante e, portanto, usar universo diferente da lista detalhada
-- (que respeita o capturado_em do snapshot alunos_admin). O resultado era
-- resumo=17/lista=10 para Recreio/06-2026, embora a lista estivesse coerente.
--
-- A fonte canonica do campo renovacoes_realizadas passa a ser a mesma lista
-- detalhada, depois do mesmo filtro de retencao usado por base_v4. Nenhum
-- snapshot historico e alterado; a mudanca apenas impede que dois universos
-- sejam misturados durante novas capturas/diagnosticos.

do $block$
begin
  if to_regprocedure('public.montar_relatorio_admin_mensal_payload_base_v2(uuid,integer,integer)') is not null
     and to_regprocedure('public.montar_relatorio_admin_mensal_payload_base_v2_legacy_20260811(uuid,integer,integer)') is null then
    alter function public.montar_relatorio_admin_mensal_payload_base_v2(uuid, integer, integer)
      rename to montar_relatorio_admin_mensal_payload_base_v2_legacy_20260811;
  end if;
end;
$block$;

revoke all on function public.montar_relatorio_admin_mensal_payload_base_v2_legacy_20260811(uuid, integer, integer)
  from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_admin_mensal_payload_base_v2(
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
  v_resumo jsonb;
  v_renovacoes_validas jsonb;
begin
  v_payload := public.montar_relatorio_admin_mensal_payload_base_v2_legacy_20260811(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_renovacoes_validas := public.filtrar_renovacoes_admin_retencao_validas_v1(
    coalesce(v_payload->'renovacoes', '[]'::jsonb)
  );
  v_resumo := coalesce(v_payload->'resumo', '{}'::jsonb)
    || jsonb_build_object(
      'renovacoes_realizadas', jsonb_array_length(v_renovacoes_validas)
    );

  return jsonb_set(v_payload, '{resumo}', v_resumo, true);
end;
$function$;

revoke all on function public.montar_relatorio_admin_mensal_payload_base_v2(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.montar_relatorio_admin_mensal_payload_base_v2(uuid, integer, integer) is
  'Payload administrativo intermediario com renovacoes_realizadas derivadas da mesma lista filtrada exibida no fechamento.';
