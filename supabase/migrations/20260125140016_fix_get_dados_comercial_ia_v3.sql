-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION get_dados_comercial_ia(
  p_unidade_id UUID,
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_kpis_atual JSONB;
  v_metas JSONB;
  v_kpis_ano_passado JSONB;
  v_leads_por_canal JSONB;
  v_leads_por_curso JSONB;
  v_professores_matriculadores JSONB;
  v_leads_pendentes JSONB;
  v_experimentais_agendadas JSONB;
  v_motivos_nao_matricula JSONB;
  v_lancamentos_hoje JSONB;
  v_unidade_nome TEXT;
BEGIN
  -- Buscar nome da unidade para usar nas views que filtram por nome
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  END IF;

  -- KPIs do mês atual (vw_kpis_comercial_mensal)
  SELECT jsonb_build_object(
    'total_leads', COALESCE(total_leads, 0),
    'experimentais_agendadas', COALESCE(experimentais_agendadas, 0),
    'experimentais_realizadas', COALESCE(experimentais_realizadas, 0),
    'novas_matriculas', COALESCE(novas_matriculas, 0),
    'taxa_conversao_lead_exp', COALESCE(taxa_conversao_lead_exp, 0),
    'taxa_conversao_exp_mat', COALESCE(taxa_conversao_exp_mat, 0),
    'taxa_conversao_geral', COALESCE(taxa_conversao_geral, 0),
    'ticket_medio_novos', COALESCE(ticket_medio_novos, 0)
  )
  INTO v_kpis_atual
  FROM vw_kpis_comercial_mensal
  WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    AND ano = p_ano
    AND mes = p_mes;

  -- Metas do mês (simulacoes_metas)
  SELECT jsonb_build_object(
    'leads_mensais', COALESCE(leads_mensais, 0),
    'experimentais_mensais', COALESCE(experimentais_mensais, 0),
    'matriculas_mensais', COALESCE(matriculas_mensais, 0),
    'ticket_medio', COALESCE(ticket_medio, 0)
  )
  INTO v_metas
  FROM simulacoes_metas
  WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id::text)
    AND ano = p_ano
    AND mes_objetivo = p_mes
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_metas IS NULL THEN
    v_metas := '{}'::jsonb;
  END IF;

  -- KPIs do mesmo mês do ano passado
  SELECT jsonb_build_object(
    'total_leads', COALESCE(total_leads, 0),
    'novas_matriculas', COALESCE(novas_matriculas, 0)
  )
  INTO v_kpis_ano_passado
  FROM vw_kpis_comercial_mensal
  WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    AND ano = p_ano - 1
    AND mes = p_mes;

  -- Leads por canal (usando subquery para evitar agregação aninhada)
  SELECT COALESCE(jsonb_agg(canal_data), '[]'::jsonb)
  INTO v_leads_por_canal
  FROM (
    SELECT jsonb_build_object(
      'canal', canal,
      'leads', total_leads,
      'matriculas', matriculas
    ) as canal_data
    FROM vw_leads_por_canal
    WHERE (p_unidade_id IS NULL OR unidade = v_unidade_nome)
      AND ano_mes = TO_CHAR(make_date(p_ano, p_mes, 1), 'YYYY-MM')
    ORDER BY total_leads DESC
    LIMIT 10
  ) sub;

  -- Leads por curso (usando subquery)
  SELECT COALESCE(jsonb_agg(curso_data), '[]'::jsonb)
  INTO v_leads_por_curso
  FROM (
    SELECT jsonb_build_object(
      'curso', c.nome,
      'quantidade', COUNT(*)
    ) as curso_data
    FROM leads l
    JOIN cursos c ON l.curso_interesse_id = c.id
    WHERE (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      AND EXTRACT(YEAR FROM l.data_contato) = p_ano
      AND EXTRACT(MONTH FROM l.data_contato) = p_mes
    GROUP BY c.nome
    ORDER BY COUNT(*) DESC
    LIMIT 10
  ) sub;

  -- Professores que mais matriculam (usando subquery)
  SELECT COALESCE(jsonb_agg(prof_data), '[]'::jsonb)
  INTO v_professores_matriculadores
  FROM (
    SELECT jsonb_build_object(
      'professor', professor,
      'matriculas', matriculas
    ) as prof_data
    FROM vw_performance_professor_experimental
    WHERE (p_unidade_id IS NULL OR unidade = v_unidade_nome)
      AND ano_mes = make_date(p_ano, p_mes, 1)
    ORDER BY matriculas DESC
    LIMIT 5
  ) sub;

  -- Leads pendentes (usando subquery)
  SELECT COALESCE(jsonb_agg(lead_data), '[]'::jsonb)
  INTO v_leads_pendentes
  FROM (
    SELECT jsonb_build_object(
      'nome', nome_lead,
      'dias_sem_contato', EXTRACT(DAY FROM (CURRENT_DATE - COALESCE(data_ultimo_contato, data_contato)))::integer
    ) as lead_data
    FROM leads
    WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
      AND status NOT IN ('convertido', 'perdido')
      AND COALESCE(data_ultimo_contato, data_contato) < CURRENT_DATE - INTERVAL '3 days'
    ORDER BY data_ultimo_contato ASC NULLS FIRST
    LIMIT 10
  ) sub;

  -- Experimentais agendadas (usando subquery)
  SELECT COALESCE(jsonb_agg(exp_data), '[]'::jsonb)
  INTO v_experimentais_agendadas
  FROM (
    SELECT jsonb_build_object(
      'data', l.data_experimental,
      'aluno', l.nome_lead,
      'curso', c.nome
    ) as exp_data
    FROM leads l
    JOIN cursos c ON l.curso_interesse_id = c.id
    WHERE (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      AND l.experimental_agendada = true
      AND l.data_experimental BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    ORDER BY l.data_experimental ASC
    LIMIT 10
  ) sub;

  -- Motivos de não matrícula (usando subquery)
  SELECT COALESCE(jsonb_agg(motivo_data), '[]'::jsonb)
  INTO v_motivos_nao_matricula
  FROM (
    SELECT jsonb_build_object(
      'motivo', motivo,
      'quantidade', quantidade
    ) as motivo_data
    FROM vw_motivos_nao_matricula
    WHERE (p_unidade_id IS NULL OR unidade = v_unidade_nome)
      AND ano_mes = make_date(p_ano, p_mes, 1)
    ORDER BY quantidade DESC
    LIMIT 5
  ) sub;

  -- Lançamentos de hoje
  SELECT jsonb_build_object(
    'leads', COALESCE(SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END), 0),
    'experimentais', COALESCE(SUM(CASE WHEN tipo = 'experimental' THEN quantidade ELSE 0 END), 0),
    'matriculas', COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END), 0)
  )
  INTO v_lancamentos_hoje
  FROM leads_diarios
  WHERE (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
    AND data = CURRENT_DATE;

  -- Montar resultado final
  v_result := jsonb_build_object(
    'kpis_atual', COALESCE(v_kpis_atual, '{}'::jsonb),
    'metas', COALESCE(v_metas, '{}'::jsonb),
    'kpis_ano_passado', COALESCE(v_kpis_ano_passado, '{}'::jsonb),
    'leads_por_canal', COALESCE(v_leads_por_canal, '[]'::jsonb),
    'leads_por_curso', COALESCE(v_leads_por_curso, '[]'::jsonb),
    'professores_matriculadores', COALESCE(v_professores_matriculadores, '[]'::jsonb),
    'leads_pendentes', COALESCE(v_leads_pendentes, '[]'::jsonb),
    'experimentais_agendadas', COALESCE(v_experimentais_agendadas, '[]'::jsonb),
    'motivos_nao_matricula', COALESCE(v_motivos_nao_matricula, '[]'::jsonb),
    'lancamentos_hoje', COALESCE(v_lancamentos_hoje, '{}'::jsonb)
  );

  RETURN v_result;
END;
$$;
