-- P02R - Relatorio gerencial: bloco comercial via fonte v2/diagnostica
--
-- Aplicado manualmente em producao em 2026-06-20.
--
-- Objetivo:
-- - Preservar o payload amplo do relatorio gerencial existente.
-- - Substituir somente `kpis_comercial` por:
--   - leads via get_kpis_comercial_canonicos_v2;
--   - experimentais via get_experimentais_comercial_diagnostico_v2;
--   - novas matriculas via kpis de alunos canonicos ja presentes no payload.
-- - Manter taxa Experimental -> Matricula bloqueada.
--
-- Nao altera dados.
-- Nao mexe em lead_experimentais, leads, alunos, presencas ou snapshots.

do $$
begin
  if to_regprocedure('public.get_dados_relatorio_gerencial_legacy_p02r_20260620(uuid, integer, integer)') is null then
    alter function public.get_dados_relatorio_gerencial(uuid, integer, integer)
      rename to get_dados_relatorio_gerencial_legacy_p02r_20260620;
  end if;
end $$;

create or replace function public.get_dados_relatorio_gerencial(
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
  v_result jsonb;
  v_comercial jsonb;
  v_exp_diag jsonb;
  v_kpis jsonb;
  v_exp_totais jsonb;
  v_kpi_gestao jsonb;
  v_total_leads integer := 0;
  v_exp_agendadas integer := 0;
  v_exp_operacional integer := 0;
  v_exp_presenca integer := 0;
  v_exp_sem_presenca integer := 0;
  v_faltaram integer := 0;
  v_matriculas_alunos integer := 0;
  v_taxa_lead_exp numeric := 0;
  v_taxa_geral numeric := 0;
  v_kpis_comercial jsonb;
begin
  v_result := public.get_dados_relatorio_gerencial_legacy_p02r_20260620(p_unidade_id, p_ano, p_mes);

  v_comercial := public.get_kpis_comercial_canonicos_v2(p_unidade_id, p_ano, p_mes, 'mensal', null);
  v_exp_diag := public.get_experimentais_comercial_diagnostico_v2(p_unidade_id, p_ano, p_mes, 'mensal', null);
  v_kpis := coalesce(v_comercial->'kpis', '{}'::jsonb);
  v_exp_totais := coalesce(v_exp_diag->'totais', '{}'::jsonb);

  select elem
    into v_kpi_gestao
  from jsonb_array_elements(coalesce(v_result->'kpis_gestao', '[]'::jsonb)) as elem
  where coalesce((elem->>'ano')::integer, p_ano) = p_ano
    and coalesce((elem->>'mes')::integer, p_mes) = p_mes
  limit 1;

  v_kpi_gestao := coalesce(v_kpi_gestao, coalesce(v_result->'kpis_gestao'->0, '{}'::jsonb));

  v_total_leads := coalesce(nullif(v_kpis->>'leads_entrantes', '')::integer, 0);
  v_exp_agendadas := coalesce(nullif(v_exp_totais->>'experimentais_agendadas_eventos', '')::integer, 0);
  v_exp_operacional := coalesce(nullif(v_exp_totais->>'experimentais_realizadas_status_operacional', '')::integer, 0);
  v_exp_presenca := coalesce(nullif(v_exp_totais->>'experimentais_realizadas_presenca_confirmada', '')::integer, 0);
  v_exp_sem_presenca := coalesce(nullif(v_exp_totais->>'experimentais_status_operacional_sem_presenca', '')::integer, 0);
  v_faltaram := coalesce(nullif(v_exp_totais->>'no_show_status_operacional', '')::integer, 0);
  v_matriculas_alunos := coalesce(nullif(v_kpi_gestao->>'novas_matriculas', '')::integer, 0);

  v_taxa_lead_exp := case when v_total_leads > 0 then round(v_exp_operacional::numeric / v_total_leads * 100, 1) else 0 end;
  v_taxa_geral := case when v_total_leads > 0 then round(v_matriculas_alunos::numeric / v_total_leads * 100, 1) else 0 end;

  v_kpis_comercial := jsonb_build_object(
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'fonte', 'relatorio_gerencial_p02r_v2',
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
    'taxa_conversao_exp_mat', null,
    'taxa_exp_mat_status', 'bloqueada_regra_canonica_presenca_vinculo',
    'taxa_conversao_geral', v_taxa_geral,
    'faturamento_novos', 0,
    'ticket_medio_novos', 0
  );

  v_result := jsonb_set(v_result, '{kpis_comercial}', jsonb_build_array(v_kpis_comercial), true);
  v_result := jsonb_set(v_result, '{kpis_comercial_fonte}', to_jsonb('p02r_wrapper_v2_leads_experimentais_diagnostico_matriculas_alunos'::text), true);

  return v_result;
end;
$function$;

revoke all on function public.get_dados_relatorio_gerencial(uuid, integer, integer) from public, anon;
grant execute on function public.get_dados_relatorio_gerencial(uuid, integer, integer) to authenticated, service_role;

comment on function public.get_dados_relatorio_gerencial(uuid, integer, integer)
is 'P02R: wrapper do relatorio gerencial preservando payload legado e substituindo kpis_comercial por leads v2 + experimentais diagnosticas P02Q + novas_matriculas canonicas de alunos. Taxa Exp->Mat bloqueada.';

-- Rollback manual, se necessario:
-- drop function public.get_dados_relatorio_gerencial(uuid, integer, integer);
-- alter function public.get_dados_relatorio_gerencial_legacy_p02r_20260620(uuid, integer, integer)
--   rename to get_dados_relatorio_gerencial;
