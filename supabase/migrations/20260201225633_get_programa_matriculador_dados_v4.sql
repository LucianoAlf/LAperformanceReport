-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION get_programa_matriculador_dados(
  p_ano INTEGER DEFAULT 2026,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config JSONB;
  v_hunters JSONB;
  v_penalidades JSONB;
  v_historico JSONB;
BEGIN
  -- 1. Buscar configurações do programa
  SELECT jsonb_build_object(
    'ano', c.ano,
    'metas', jsonb_build_object(
      'taxa_showup_experimental', c.taxa_showup_experimental,
      'taxa_experimental_matricula', c.taxa_experimental_matricula,
      'taxa_lead_matricula', c.taxa_lead_matricula,
      'volume_campo_grande', COALESCE((c.metas_volume->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::int, 21),
      'volume_recreio', COALESCE((c.metas_volume->>'95553e96-971b-4590-a6eb-0201d013c14d')::int, 17),
      'volume_barra', COALESCE((c.metas_volume->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::int, 14),
      'ticket_campo_grande', COALESCE((c.metas_ticket->>'2ec861f6-023f-4d7b-9927-3960ad8c2a92')::int, 450),
      'ticket_recreio', COALESCE((c.metas_ticket->>'95553e96-971b-4590-a6eb-0201d013c14d')::int, 420),
      'ticket_barra', COALESCE((c.metas_ticket->>'368d47f5-2d88-4475-bc14-ba084a9a348e')::int, 450)
    ),
    'pontuacao', jsonb_build_object(
      'taxa_showup', c.pontos_taxa_showup,
      'taxa_exp_mat', c.pontos_taxa_exp_mat,
      'taxa_geral', c.pontos_taxa_geral,
      'volume_medio', c.pontos_volume,
      'ticket_medio', c.pontos_ticket
    ),
    'nota_corte', c.nota_corte,
    'periodo', jsonb_build_object('mes_inicio', c.mes_inicio, 'mes_fim', c.mes_fim)
  ) INTO v_config
  FROM programa_matriculador_config c
  WHERE c.ano = p_ano;
  
  -- Se não encontrou config, usar valores padrão
  IF v_config IS NULL THEN
    v_config := jsonb_build_object(
      'ano', p_ano,
      'metas', jsonb_build_object(
        'taxa_showup_experimental', 18, 'taxa_experimental_matricula', 75, 'taxa_lead_matricula', 13.5,
        'volume_campo_grande', 21, 'volume_recreio', 17, 'volume_barra', 14,
        'ticket_campo_grande', 450, 'ticket_recreio', 420, 'ticket_barra', 450
      ),
      'pontuacao', jsonb_build_object('taxa_showup', 20, 'taxa_exp_mat', 25, 'taxa_geral', 30, 'volume_medio', 15, 'ticket_medio', 10),
      'nota_corte', 80,
      'periodo', jsonb_build_object('mes_inicio', 1, 'mes_fim', 11)
    );
  END IF;

  -- 2. Buscar dados dos Hunters (usando tabela comercial_diario se existir, senão valores zerados)
  SELECT jsonb_agg(jsonb_build_object(
    'unidade_id', u.id,
    'unidade_nome', u.nome,
    'hunter_nome', COALESCE(u.hunter_nome, 'Hunter'),
    'hunter_apelido', COALESCE(u.hunter_apelido, u.hunter_nome, 'Hunter'),
    'metricas', jsonb_build_object(
      'total_leads', COALESCE(cd.total_leads, 0),
      'total_experimentais', COALESCE(cd.total_experimentais, 0),
      'total_matriculas', COALESCE(cd.total_matriculas, 0),
      'meses_com_dados', GREATEST(COALESCE(cd.meses, 1), 1),
      'media_matriculas_mes', ROUND(COALESCE(cd.total_matriculas, 0)::numeric / GREATEST(COALESCE(cd.meses, 1), 1), 1),
      'media_ticket', COALESCE(tm.media_ticket, 0),
      'taxa_showup_exp', CASE WHEN COALESCE(cd.total_leads, 0) > 0 THEN ROUND((COALESCE(cd.total_experimentais, 0)::numeric / cd.total_leads) * 100, 1) ELSE 0 END,
      'taxa_exp_mat', CASE WHEN COALESCE(cd.total_experimentais, 0) > 0 THEN ROUND((COALESCE(cd.total_matriculas, 0)::numeric / cd.total_experimentais) * 100, 1) ELSE 0 END,
      'taxa_geral', CASE WHEN COALESCE(cd.total_leads, 0) > 0 THEN ROUND((COALESCE(cd.total_matriculas, 0)::numeric / cd.total_leads) * 100, 1) ELSE 0 END
    ),
    'penalidades', jsonb_build_object(
      'total_pontos', COALESCE(pt.total_pontos, 0),
      'quantidade', COALESCE(pt.quantidade, 0)
    )
  )) INTO v_hunters
  FROM unidades u
  LEFT JOIN LATERAL (
    SELECT 
      SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END) as total_leads,
      SUM(CASE WHEN tipo IN ('experimental_agendada', 'experimental_realizada') THEN quantidade ELSE 0 END) as total_experimentais,
      SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END) as total_matriculas,
      COUNT(DISTINCT EXTRACT(MONTH FROM data)) as meses
    FROM comercial_diario
    WHERE unidade_id = u.id AND EXTRACT(YEAR FROM data) = p_ano AND EXTRACT(MONTH FROM data) BETWEEN 1 AND 11
  ) cd ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(AVG(valor_parcela), 0) as media_ticket
    FROM alunos
    WHERE unidade_id = u.id AND data_matricula >= (p_ano || '-01-01')::date AND data_matricula <= (p_ano || '-11-30')::date AND valor_parcela > 0
  ) tm ON true
  LEFT JOIN LATERAL (
    SELECT SUM(pontos_descontados) as total_pontos, COUNT(*) as quantidade
    FROM programa_matriculador_penalidades
    WHERE unidade_id = u.id AND ano = p_ano
  ) pt ON true
  WHERE u.ativo = true AND (p_unidade_id IS NULL OR u.id = p_unidade_id);

  -- 3. Buscar penalidades
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'unidade_id', p.unidade_id, 'unidade_nome', u.nome, 'tipo', p.tipo, 'descricao', p.descricao,
    'pontos_descontados', p.pontos_descontados, 'data_ocorrencia', p.data_ocorrencia, 'registrado_por', p.registrado_por
  ) ORDER BY p.data_ocorrencia DESC) INTO v_penalidades
  FROM programa_matriculador_penalidades p JOIN unidades u ON u.id = p.unidade_id
  WHERE p.ano = p_ano AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id);

  -- 4. Buscar histórico
  SELECT jsonb_agg(jsonb_build_object(
    'ano', h.ano, 'mes', h.mes, 'unidade_id', h.unidade_id,
    'total_leads', h.total_leads, 'total_matriculas', h.total_matriculas,
    'taxa_showup', h.taxa_showup, 'taxa_exp_mat', h.taxa_exp_mat, 'taxa_geral', h.taxa_geral, 'ticket_medio', h.ticket_medio
  ) ORDER BY h.mes) INTO v_historico
  FROM programa_matriculador_historico h
  WHERE h.ano = p_ano AND (p_unidade_id IS NULL OR h.unidade_id = p_unidade_id);

  RETURN jsonb_build_object(
    'config', v_config, 
    'hunters', COALESCE(v_hunters, '[]'::jsonb), 
    'penalidades', COALESCE(v_penalidades, '[]'::jsonb), 
    'historico', COALESCE(v_historico, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_programa_matriculador_dados(INTEGER, UUID) TO authenticated, anon, service_role;
