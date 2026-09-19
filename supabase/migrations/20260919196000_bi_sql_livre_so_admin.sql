-- 19/09/2026: execute_bi_query_lamusic (LA Report) executava SQL livre vindo do navegador
-- como postgres e qualquer usuario logado (professor inclusive) podia chamar. Porteiro:
-- service_role ou admin ativo. search_path fixo (era SECURITY DEFINER sem).
-- Espelhar no repositorio do LA Report.
CREATE OR REPLACE FUNCTION public.execute_bi_query_lamusic(query_text text, p_unidade_id uuid DEFAULT NULL::uuid, max_rows integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result JSONB;
BEGIN
  -- 19/09/2026: roda SQL livre como dono do banco. Tinha EXECUTE para qualquer
  -- usuario logado -- inclusive PROFESSOR do LA Teacher (mesmo projeto): lia
  -- qualquer tabela e chamava qualquer funcao. Agora so a rotina de servico (a
  -- edge bi-agent-lamusic usa a service_role) e admin ativo (tela de Configuracoes).
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR public.is_admin()) THEN
    RAISE EXCEPTION 'ACESSO_NEGADO_BI' USING ERRCODE = '42501';
  END IF;
  IF p_unidade_id IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'SELECT jsonb_agg(row_to_json(t)) FROM (
          SELECT * FROM (%s) sub WHERE unidade_id = %L LIMIT %s
        ) t',
        query_text, p_unidade_id, max_rows
      ) INTO result;
    EXCEPTION WHEN undefined_column THEN
      -- Coluna unidade_id não existe no resultado — executar sem filtro
      EXECUTE format(
        'SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM (%s) sub LIMIT %s) t',
        query_text, max_rows
      ) INTO result;
    END;
  ELSE
    EXECUTE format(
      'SELECT jsonb_agg(row_to_json(t)) FROM (SELECT * FROM (%s) sub LIMIT %s) t',
      query_text, max_rows
    ) INTO result;
  END IF;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$function$;
