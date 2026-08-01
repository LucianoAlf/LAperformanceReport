-- Corrige a leitura do financeiro aninhado e consolida evasoes no mesmo
-- conceito do relatorio administrativo diario: interrupcoes + nao renovacoes.

alter function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  rename to montar_relatorio_admin_mensal_payload_base_v1;

revoke all on function public.montar_relatorio_admin_mensal_payload_base_v1(uuid, integer, integer)
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
  v_gerencial public.fechamento_mensal_snapshots%rowtype;
  v_financeiro jsonb := '{}'::jsonb;
  v_retencao jsonb := '{}'::jsonb;
  v_nao_renovacoes integer := 0;
  v_evasoes_operacionais integer := 0;
begin
  v_payload := public.montar_relatorio_admin_mensal_payload_base_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  select * into v_gerencial
  from public.fechamento_mensal_snapshots s
  where s.ano = p_ano
    and s.mes = p_mes
    and s.escopo = 'unidade'
    and s.unidade_id = p_unidade_id
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('aprovado', 'fechado')
  order by s.versao desc
  limit 1;

  if v_gerencial.id is null
     or public.hash_jsonb_canonico(v_gerencial.payload) <> v_gerencial.payload_hash then
    raise exception 'SNAPSHOT_ADMIN_DIVERGENTE: relatorio gerencial ausente ou corrompido';
  end if;

  v_financeiro := coalesce(
    v_gerencial.payload->'financeiro_faturas_emusys'->'totais',
    v_gerencial.payload->'kpis_gestao'->0->'financeiro_faturas_emusys',
    v_gerencial.payload->'dados_mes_atual'->0->'financeiro_faturas_emusys',
    '{}'::jsonb
  );
  v_retencao := coalesce(
    v_gerencial.payload->'kpis_retencao'->0,
    '{}'::jsonb
  );
  v_resumo := coalesce(v_payload->'resumo', '{}'::jsonb);

  v_nao_renovacoes := coalesce(
    nullif(v_retencao->>'nao_renovacoes', '')::integer,
    nullif(v_resumo->>'nao_renovacoes', '')::integer,
    0
  );
  v_evasoes_operacionais := coalesce(
    nullif(v_retencao->>'total_evasoes', '')::integer,
    jsonb_array_length(coalesce(v_payload->'evasoes', '[]'::jsonb)),
    0
  );

  v_resumo := v_resumo || jsonb_build_object(
    'mrr', coalesce(nullif(v_financeiro->>'mrr_atual', '')::numeric, 0),
    'ticket_medio', coalesce(nullif(v_financeiro->>'ticket_medio', '')::numeric, 0),
    'renovacoes_realizadas', coalesce(
      nullif(v_retencao->>'renovacoes_realizadas', '')::integer,
      nullif(v_resumo->>'renovacoes_realizadas', '')::integer,
      0
    ),
    'nao_renovacoes', v_nao_renovacoes,
    'evasoes', v_evasoes_operacionais + v_nao_renovacoes
  );

  return jsonb_set(v_payload, '{resumo}', v_resumo, true);
end;
$function$;

revoke all on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer)
  from public, anon, authenticated, service_role;

comment on function public.montar_relatorio_admin_mensal_payload_v1(uuid, integer, integer) is
  'Payload mensal administrativo fechado, com financeiro Emusys aninhado e evasoes no conceito administrativo consolidado.';
