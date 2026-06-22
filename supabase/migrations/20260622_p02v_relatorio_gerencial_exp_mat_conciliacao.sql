CREATE OR REPLACE FUNCTION public.get_dados_relatorio_gerencial(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_comercial jsonb;
  v_conciliacao jsonb;
  v_kpis jsonb;
  v_conc_resumo jsonb;
  v_kpi_gestao jsonb;
  v_total_leads integer := 0;
  v_exp_agendadas integer := 0;
  v_exp_operacional integer := 0;
  v_exp_presenca integer := 0;
  v_exp_sem_presenca integer := 0;
  v_faltaram integer := 0;
  v_matriculas_alunos integer := 0;
  v_taxa_lead_exp numeric := 0;
  v_taxa_exp_mat numeric := 0;
  v_taxa_geral numeric := 0;
  v_denominador_exp_mat integer := 0;
  v_conversoes_exp_mat integer := 0;
  v_pendencias_exp_mat integer := 0;
  v_taxa_exp_mat_liberada boolean := false;
  v_kpis_comercial jsonb;
begin
  v_result := public.get_dados_relatorio_gerencial_legacy_p02r_20260620(p_unidade_id, p_ano, p_mes);

  v_comercial := public.get_kpis_comercial_canonicos_v2(p_unidade_id, p_ano, p_mes, 'mensal', null);
  v_conciliacao := public.get_conciliacao_experimentais_v2(p_unidade_id, p_ano, p_mes, 'mensal', null);
  v_kpis := coalesce(v_comercial->'kpis', '{}'::jsonb);
  v_conc_resumo := coalesce(v_conciliacao->'resumo', '{}'::jsonb);

  select elem
    into v_kpi_gestao
  from jsonb_array_elements(coalesce(v_result->'kpis_gestao', '[]'::jsonb)) as elem
  where coalesce((elem->>'ano')::integer, p_ano) = p_ano
    and coalesce((elem->>'mes')::integer, p_mes) = p_mes
  limit 1;

  v_kpi_gestao := coalesce(v_kpi_gestao, coalesce(v_result->'kpis_gestao'->0, '{}'::jsonb));

  v_total_leads := coalesce(nullif(v_kpis->>'leads_entrantes', '')::integer, 0);
  v_exp_agendadas := coalesce(nullif(v_conc_resumo->>'experimentais_agendadas', '')::integer, 0);
  v_exp_operacional := coalesce(nullif(v_conc_resumo->>'realizadas_status_operacional', '')::integer, 0);
  v_exp_presenca := coalesce(nullif(v_conc_resumo->>'experimentais_realizadas_confirmadas', '')::integer, 0);
  v_exp_sem_presenca := coalesce(nullif(v_conc_resumo->>'realizadas_sem_presenca_confirmada', '')::integer, 0);
  v_faltaram := coalesce(nullif(v_conc_resumo->>'experimentais_faltaram', '')::integer, 0);
  v_denominador_exp_mat := coalesce(nullif(v_conc_resumo->>'denominador_taxa_exp_mat', '')::integer, 0);
  v_conversoes_exp_mat := coalesce(nullif(v_conc_resumo->>'conversoes_exp_mat_canonicas', '')::integer, 0);
  v_pendencias_exp_mat := coalesce(nullif(v_conc_resumo->>'pendencias_taxa_exp_mat', '')::integer, 0);
  v_taxa_exp_mat := coalesce(nullif(v_conc_resumo->>'taxa_exp_mat_canonica', '')::numeric, 0);
  v_taxa_exp_mat_liberada := coalesce((v_conc_resumo->>'taxa_exp_mat_liberada')::boolean, false);
  v_matriculas_alunos := coalesce(nullif(v_kpi_gestao->>'novas_matriculas', '')::integer, 0);

  v_taxa_lead_exp := case when v_total_leads > 0 then round(v_exp_operacional::numeric / v_total_leads * 100, 1) else 0 end;
  v_taxa_geral := case when v_total_leads > 0 then round(v_matriculas_alunos::numeric / v_total_leads * 100, 1) else 0 end;

  v_kpis_comercial := jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'fonte', 'relatorio_gerencial_p02v_conciliacao',
    'total_leads', v_total_leads,
    'leads_entrantes', v_total_leads,
    'experimentais_agendadas', v_exp_agendadas,
    'experimentais_agendadas_eventos', v_exp_agendadas,
    'experimentais_realizadas', v_exp_operacional,
    'experimentais_realizadas_status_operacional', v_exp_operacional,
    'experimentais_realizadas_presenca_confirmada', v_exp_presenca,
    'experimentais_status_operacional_sem_presenca', v_exp_sem_presenca,
    'faltaram', v_faltaram,
    'novas_matriculas', v_matriculas_alunos,
    'matriculas_academicas_canonicas', v_matriculas_alunos,
    'taxa_showup', case when v_exp_agendadas > 0 then round(v_exp_operacional::numeric / v_exp_agendadas * 100, 1) else 0 end,
    'taxa_conversao_lead_exp', v_taxa_lead_exp,
    'taxa_conversao_exp_mat', case when v_taxa_exp_mat_liberada then v_taxa_exp_mat else null end,
    'taxa_exp_mat_canonica', v_taxa_exp_mat,
    'taxa_exp_mat_liberada', v_taxa_exp_mat_liberada,
    'taxa_exp_mat_status', coalesce(nullif(v_conc_resumo->>'taxa_exp_mat_status', ''), 'bloqueada_pendencias_conciliacao'),
    'denominador_taxa_exp_mat', v_denominador_exp_mat,
    'conversoes_exp_mat_canonicas', v_conversoes_exp_mat,
    'pendencias_taxa_exp_mat', v_pendencias_exp_mat,
    'taxa_conversao_geral', v_taxa_geral,
    'faturamento_novos', 0,
    'ticket_medio_novos', 0
  );

  v_result := jsonb_set(v_result, '{kpis_comercial}', jsonb_build_array(v_kpis_comercial), true);
  v_result := jsonb_set(v_result, '{kpis_comercial_fonte}', to_jsonb('p02v_wrapper_conciliacao_exp_mat'::text), true);

  return v_result;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_gerencial(uuid, integer, integer) TO authenticated, service_role;
