-- Rollback capturado antes do P0.1C em producao
-- Projeto: ouqwbbermlzqqvtqwlul
-- Capturado em: 2026-06-13T10:40:11.8552020-03:00

-- get_dados_relatorio_gerencial(uuid,integer,integer)
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_gerencial(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_kpis jsonb;
  v_totais jsonb;
BEGIN
  v_result := public.get_dados_relatorio_gerencial_legacy_p01g(p_unidade_id, p_ano, p_mes);
  v_kpis := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);
  v_totais := COALESCE(v_kpis->'totais', '{}'::jsonb);

  v_result := jsonb_set(v_result, '{kpis_gestao}', COALESCE(v_kpis->'por_unidade', '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{kpis_alunos_canonicos}', v_kpis, true);
  v_result := jsonb_set(v_result, '{dados_mes_atual}', COALESCE(v_kpis->'por_unidade', '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{matriculas_ativas}', COALESCE(v_totais->'matriculas_ativas', '0'::jsonb), true);
  v_result := jsonb_set(v_result, '{matriculas_banda}', COALESCE(v_totais->'matriculas_banda', '0'::jsonb), true);
  v_result := jsonb_set(v_result, '{matriculas_2_curso}', COALESCE(v_totais->'matriculas_2_curso', '0'::jsonb), true);
  v_result := jsonb_set(v_result, '{total_bolsistas}', to_jsonb(
    COALESCE((v_totais->>'bolsistas_integrais')::integer, 0)
    + COALESCE((v_totais->>'bolsistas_parciais')::integer, 0)
  ), true);

  RETURN v_result;
END;
$function$


-- get_dados_retencao_ia(uuid,integer,integer)
CREATE OR REPLACE FUNCTION public.get_dados_retencao_ia(p_unidade_id uuid DEFAULT NULL::uuid, p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer, p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::integer)
 RETURNS json
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_kpis jsonb;
BEGIN
  v_result := public.get_dados_retencao_ia_legacy_p01g(p_unidade_id, p_ano, p_mes)::jsonb;
  v_kpis := public.get_kpis_alunos_canonicos(p_unidade_id, p_ano, p_mes);

  v_result := jsonb_set(v_result, '{kpis_gestao}', COALESCE(v_kpis->'por_unidade', '[]'::jsonb), true);
  v_result := jsonb_set(v_result, '{kpis_alunos_canonicos}', v_kpis, true);

  RETURN v_result::json;
END;
$function$


