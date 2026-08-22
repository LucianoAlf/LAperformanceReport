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
      'taxa_showup_experimental', c.meta_taxa_showup_experimental,
      'taxa_experimental_matricula', c.meta_taxa_experimental_matricula,
      'taxa_lead_matricula', c.meta_taxa_lead_matricula,
      'volume_campo_grande', c.meta_volume_campo_grande,
      'volume_recreio', c.meta_volume_recreio,
      'volume_barra', c.meta_volume_barra,
      'ticket_campo_grande', c.meta_ticket_campo_grande,
      'ticket_recreio', c.meta_ticket_recreio,
      'ticket_barra', c.meta_ticket_barra
    ),
    'pontuacao', jsonb_build_object(
      'taxa_showup', c.pontos_taxa_showup,
      'taxa_exp_mat', c.pontos_taxa_exp_mat,
      'taxa_geral', c.pontos_taxa_geral,
      'volume_medio', c.pontos_volume_medio,
      'ticket_medio', c.pontos_ticket_medio
    ),
    'bonus', jsonb_build_object(
      'taxa_showup_por_2pct', c.bonus_taxa_showup_por_2pct,
      'taxa_exp_mat_por_5pct', c.bonus_taxa_exp_mat_por_5pct,
      'taxa_geral_por_1pct', c.bonus_taxa_geral_por_1pct,
      'volume_por_2_acima', c.bonus_volume_por_2_acima,
      'ticket_por_20_acima', c.bonus_ticket_por_20_acima
    ),
    'penalidades', jsonb_build_object(
      'nao_preencheu_emusys', c.penalidade_nao_preencheu_emusys,
      'nao_preencheu_lareport', c.penalidade_nao_preencheu_lareport,
      'lead_abandonado', c.penalidade_lead_abandonado,
      'reincidencia_mes', c.penalidade_reincidencia_mes
    ),
    'nota_corte', c.nota_corte,
    'periodo', jsonb_build_object('mes_inicio', c.mes_inicio, 'mes_fim', c.mes_fim)
  ) INTO v_config
  FROM programa_matriculador_config c
  WHERE c.ano = p_ano;
  
  IF v_config IS NULL THEN
    v_config := jsonb_build_object(
      'ano', p_ano,
      'metas', jsonb_build_object(
        'taxa_showup_experimental', 18, 'taxa_experimental_matricula', 75, 'taxa_lead_matricula', 13.5,
        'volume_campo_grande', 21, 'volume_recreio', 17, 'volume_barra', 14,
        'ticket_campo_grande', 450, 'ticket_recreio', 420, 'ticket_barra', 450
      ),
      'pontuacao', jsonb_build_object('taxa_showup', 20, 'taxa_exp_mat', 25, 'taxa_geral', 30, 'volume_medio', 15, 'ticket_medio', 10),
      'bonus', jsonb_build_object('taxa_showup_por_2pct', 5, 'taxa_exp_mat_por_5pct', 5, 'taxa_geral_por_1pct', 10, 'volume_por_2_acima', 5, 'ticket_por_20_acima', 5),
      'penalidades', jsonb_build_object('nao_preencheu_emusys', 3, 'nao_preencheu_lareport', 2, 'lead_abandonado', 5, 'reincidencia_mes', 3),
      'nota_corte', 80,
      'periodo', jsonb_build_object('mes_inicio', 1, 'mes_fim', 11)
    );
  END IF;

  -- 2. Buscar dados dos Hunters usando leads_diarios
  SELECT jsonb_agg(jsonb_build_object(
    'unidade_id', u.id,
    'unidade_nome', u.nome,
    'hunter_nome', COALESCE(u.hunter_nome, 'Hunter'),
    'hunter_apelido', COALESCE(u.hunter_apelido, u.hunter_nome, 'Hunter'),
    'metricas', jsonb_build_object(
      'total_leads', COALESCE(ld.total_leads, 0),
      'total_experimentais', COALESCE(ld.total_experimentais, 0),
      'total_matriculas', COALESCE(ld.total_matriculas, 0),
      'meses_com_dados', GREATEST(COALESCE(ld.meses, 1), 1),
      'media_matriculas_mes', ROUND(COALESCE(ld.total_matriculas, 0)::numeric / GREATEST(COALESCE(ld.meses, 1), 1), 1),
      'media_ticket', COALESCE(ld.media_ticket, 0),
      'taxa_showup_exp', CASE WHEN COALESCE(ld.total_leads, 0) > 0 THEN ROUND((COALESCE(ld.total_experimentais, 0)::numeric / ld.total_leads) * 100, 1) ELSE 0 END,
      'taxa_exp_mat', CASE WHEN COALESCE(ld.total_experimentais, 0) > 0 THEN ROUND((COALESCE(ld.total_matriculas, 0)::numeric / ld.total_experimentais) * 100, 1) ELSE 0 END,
      'taxa_geral', CASE WHEN COALESCE(ld.total_leads, 0) > 0 THEN ROUND((COALESCE(ld.total_matriculas, 0)::numeric / ld.total_leads) * 100, 1) ELSE 0 END
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
      SUM(CASE WHEN tipo IN ('experimental_agendada', 'experimental_realizada', 'experimental') THEN quantidade ELSE 0 END) as total_experimentais,
      SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END) as total_matriculas,
      COUNT(DISTINCT EXTRACT(MONTH FROM data)) as meses,
      AVG(CASE WHEN tipo = 'matricula' AND valor_parcela > 0 THEN valor_parcela ELSE NULL END) as media_ticket
    FROM leads_diarios
    WHERE unidade_id = u.id AND EXTRACT(YEAR FROM data) = p_ano AND EXTRACT(MONTH FROM data) BETWEEN 1 AND 11
  ) ld ON true
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
