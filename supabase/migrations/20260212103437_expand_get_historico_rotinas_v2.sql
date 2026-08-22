-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Dropar a função existente para poder alterar o retorno (adicionar coluna checklists_concluidos)
DROP FUNCTION IF EXISTS get_historico_rotinas(integer, integer);

-- Recriar com a coluna adicional checklists_concluidos
CREATE OR REPLACE FUNCTION public.get_historico_rotinas(p_colaborador_id integer, p_dias integer DEFAULT 7)
 RETURNS TABLE(data date, total_rotinas integer, rotinas_concluidas integer, percentual numeric, tarefas_concluidas integer, checklists_concluidos integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH datas AS (
    SELECT generate_series(
      CURRENT_DATE - (p_dias - 1),
      CURRENT_DATE,
      '1 day'::interval
    )::date as data
  ),
  rotinas_por_dia AS (
    SELECT 
      d.data,
      COUNT(r.id) as total,
      COUNT(e.id) FILTER (WHERE e.concluida = true) as concluidas
    FROM datas d
    CROSS JOIN farmer_rotinas r
    LEFT JOIN farmer_rotinas_execucao e ON e.rotina_id = r.id AND e.data_execucao = d.data
    WHERE r.colaborador_id = p_colaborador_id
      AND r.ativo = true
      AND (
        r.frequencia = 'diario'
        OR (r.frequencia = 'semanal' AND EXTRACT(ISODOW FROM d.data)::INTEGER = ANY(r.dias_semana))
        OR (r.frequencia = 'mensal' AND EXTRACT(DAY FROM d.data)::INTEGER = r.dia_mes)
      )
    GROUP BY d.data
  ),
  tarefas_por_dia AS (
    SELECT 
      concluida_em::date as data,
      COUNT(*) as total
    FROM farmer_tarefas
    WHERE colaborador_id = p_colaborador_id
      AND concluida = true
      AND concluida_em >= CURRENT_DATE - (p_dias - 1)
    GROUP BY concluida_em::date
  ),
  checklists_por_dia AS (
    SELECT 
      concluido_em::date as data,
      COUNT(*) as total
    FROM farmer_checklists
    WHERE colaborador_id = p_colaborador_id
      AND status = 'concluido'
      AND concluido_em >= CURRENT_DATE - (p_dias - 1)
    GROUP BY concluido_em::date
  )
  SELECT 
    r.data,
    r.total::INTEGER as total_rotinas,
    r.concluidas::INTEGER as rotinas_concluidas,
    CASE WHEN r.total > 0 THEN ROUND((r.concluidas::NUMERIC / r.total) * 100, 0) ELSE 0 END as percentual,
    COALESCE(t.total, 0)::INTEGER as tarefas_concluidas,
    COALESCE(ck.total, 0)::INTEGER as checklists_concluidos
  FROM rotinas_por_dia r
  LEFT JOIN tarefas_por_dia t ON t.data = r.data
  LEFT JOIN checklists_por_dia ck ON ck.data = r.data
  ORDER BY r.data DESC;
END;
$function$;
