-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION get_historico_mensal_matriculador(
  p_ano INTEGER DEFAULT 2026,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_historico JSONB;
  v_media_grupo JSONB;
BEGIN
  -- Buscar histórico mensal por unidade
  SELECT jsonb_agg(dados ORDER BY mes) INTO v_historico
  FROM (
    SELECT 
      EXTRACT(MONTH FROM data)::int as mes,
      u.id as unidade_id,
      u.nome as unidade_nome,
      SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END) as total_leads,
      SUM(CASE WHEN tipo IN ('experimental_agendada', 'experimental_realizada') THEN quantidade ELSE 0 END) as total_experimentais,
      SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END) as total_matriculas,
      ROUND(AVG(CASE WHEN tipo = 'matricula' AND valor_parcela > 0 THEN valor_parcela ELSE NULL END), 0) as ticket_medio,
      -- Taxa Show-up (Lead → Experimental)
      CASE 
        WHEN SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END) > 0 
        THEN ROUND((SUM(CASE WHEN tipo IN ('experimental_agendada', 'experimental_realizada') THEN quantidade ELSE 0 END)::numeric / 
              SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END)) * 100, 1)
        ELSE 0 
      END as taxa_showup,
      -- Taxa Exp → Mat
      CASE 
        WHEN SUM(CASE WHEN tipo IN ('experimental_agendada', 'experimental_realizada') THEN quantidade ELSE 0 END) > 0 
        THEN ROUND((SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END)::numeric / 
              SUM(CASE WHEN tipo IN ('experimental_agendada', 'experimental_realizada') THEN quantidade ELSE 0 END)) * 100, 1)
        ELSE 0 
      END as taxa_exp_mat,
      -- Taxa Geral (Lead → Matrícula) - CRITÉRIO DE DESEMPATE
      CASE 
        WHEN SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END) > 0 
        THEN ROUND((SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END)::numeric / 
              SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END)) * 100, 1)
        ELSE 0 
      END as taxa_geral
    FROM leads_diarios ld
    JOIN unidades u ON u.id = ld.unidade_id
    WHERE EXTRACT(YEAR FROM data) = p_ano 
      AND EXTRACT(MONTH FROM data) BETWEEN 1 AND 11
      AND (p_unidade_id IS NULL OR ld.unidade_id = p_unidade_id)
    GROUP BY EXTRACT(MONTH FROM data), u.id, u.nome
  ) dados;

  -- Calcular média do grupo (todas as unidades) para comparativo
  SELECT jsonb_build_object(
    'taxa_geral', ROUND(AVG(taxa_geral), 1),
    'volume_medio', ROUND(AVG(media_matriculas), 1),
    'ticket_medio', ROUND(AVG(ticket_medio), 0)
  ) INTO v_media_grupo
  FROM (
    SELECT 
      u.id,
      CASE 
        WHEN SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END) > 0 
        THEN (SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END)::numeric / 
              SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END)) * 100
        ELSE 0 
      END as taxa_geral,
      SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END)::numeric / 
        GREATEST(COUNT(DISTINCT EXTRACT(MONTH FROM data)), 1) as media_matriculas,
      AVG(CASE WHEN tipo = 'matricula' AND valor_parcela > 0 THEN valor_parcela ELSE NULL END) as ticket_medio
    FROM leads_diarios ld
    JOIN unidades u ON u.id = ld.unidade_id
    WHERE EXTRACT(YEAR FROM data) = p_ano AND EXTRACT(MONTH FROM data) BETWEEN 1 AND 11
    GROUP BY u.id
  ) por_unidade;

  RETURN jsonb_build_object(
    'historico', COALESCE(v_historico, '[]'::jsonb),
    'media_grupo', COALESCE(v_media_grupo, jsonb_build_object('taxa_geral', 0, 'volume_medio', 0, 'ticket_medio', 0))
  );
END;
$$;
