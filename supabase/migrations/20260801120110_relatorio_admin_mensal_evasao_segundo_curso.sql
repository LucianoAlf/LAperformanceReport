-- O KPI de retencao mede a base de pessoas e nao inclui a interrupcao de um
-- segundo curso. O administrativo precisa exibir todas as matriculas encerradas
-- e, separadamente, as nao renovacoes.

alter function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  rename to montar_relatorio_admin_mensal_payload_base_v2;

revoke all on function public.montar_relatorio_admin_mensal_payload_base_v2(uuid, integer, integer)
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
  v_resumo jsonb;
  v_nao_renovacoes integer := 0;
  v_evasoes_sem_nao_renovacao integer := 0;
  v_evasoes_detalhadas integer := 0;
begin
  v_payload := public.montar_relatorio_admin_mensal_payload_base_v2(
    p_unidade_id,
    p_ano,
    p_mes
  );
  v_resumo := coalesce(v_payload->'resumo', '{}'::jsonb);
  v_nao_renovacoes := coalesce(nullif(v_resumo->>'nao_renovacoes', '')::integer, 0);
  v_evasoes_detalhadas := jsonb_array_length(coalesce(v_payload->'evasoes', '[]'::jsonb));
  v_evasoes_sem_nao_renovacao := greatest(
    coalesce(nullif(v_resumo->>'evasoes', '')::integer, 0) - v_nao_renovacoes,
    v_evasoes_detalhadas
  );

  v_resumo := v_resumo || jsonb_build_object(
    'evasoes', v_evasoes_sem_nao_renovacao + v_nao_renovacoes
  );

  return jsonb_set(v_payload, '{resumo}', v_resumo, true);
end;
$function$;

revoke all on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer) is
  'Payload mensal administrativo fechado, incluindo interrupcoes de segundo curso e nao renovacoes sem dupla contagem.';
