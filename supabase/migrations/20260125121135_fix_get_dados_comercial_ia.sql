-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir função para gerar dados do Comercial para IA (Hunters)
CREATE OR REPLACE FUNCTION get_dados_comercial_ia(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_mes INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_mes_anterior INTEGER;
  v_ano_mes_anterior INTEGER;
  v_unidade_nome TEXT;
  v_dias_no_mes INTEGER;
  v_dias_passados INTEGER;
  v_dias_restantes INTEGER;
BEGIN
  -- Calcular mês anterior
  IF p_mes = 1 THEN
    v_mes_anterior := 12;
    v_ano_mes_anterior := p_ano - 1;
  ELSE
    v_mes_anterior := p_mes - 1;
    v_ano_mes_anterior := p_ano;
  END IF;

  -- Calcular dias do mês
  v_dias_no_mes := EXTRACT(DAY FROM (DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1)) + INTERVAL '1 month - 1 day'))::INTEGER;
  v_dias_passados := LEAST(EXTRACT(DAY FROM CURRENT_DATE)::INTEGER, v_dias_no_mes);
  v_dias_restantes := v_dias_no_mes - v_dias_passados;

  -- Buscar nome da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  -- Construir resultado base
  v_result := jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', TO_CHAR(TO_DATE(p_mes::TEXT, 'MM'), 'TMMonth'),
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome,
      'dias_no_mes', v_dias_no_mes,
      'dias_passados', v_dias_passados,
      'dias_restantes', v_dias_restantes
    )
  );

  -- KPIs Comerciais do mês atual (da view)
  v_result := v_result || jsonb_build_object('kpis_comercial', (
    SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
    FROM vw_kpis_comercial_mensal kc
    WHERE kc.ano = p_ano AND kc.mes = p_mes
      AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
  ));

  -- Dados do mês anterior (comercial)
  v_result := v_result || jsonb_build_object('comercial_mes_anterior', (
    SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
    FROM vw_kpis_comercial_mensal kc
    WHERE kc.ano = v_ano_mes_anterior AND kc.mes = v_mes_anterior
      AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
  ));

  -- Mesmo mês ano passado (comercial)
  v_result := v_result || jsonb_build_object('comercial_ano_passado', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'unidade', dc.unidade,
      'total_leads', dc.total_leads,
      'experimentais', dc.aulas_experimentais,
      'matriculas', dc.novas_matriculas_total,
      'ticket_medio', dc.ticket_medio_parcelas
    )), '[]'::jsonb)
    FROM dados_comerciais dc
    WHERE EXTRACT(YEAR FROM dc.competencia) = p_ano - 1 
      AND EXTRACT(MONTH FROM dc.competencia) = p_mes
      AND (p_unidade_id IS NULL OR dc.unidade = v_unidade_nome)
  ));

  -- Metas comerciais (da simulacoes_metas)
  v_result := v_result || jsonb_build_object('metas', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'unidade_id', sm.unidade_id,
      'meta_leads', sm.leads_mensais,
      'meta_experimentais', sm.experimentais_mensais,
      'meta_matriculas', sm.matriculas_mensais,
      'meta_taxa_lead_exp', sm.taxa_lead_exp,
      'meta_taxa_exp_mat', sm.taxa_exp_mat,
      'meta_ticket_medio', sm.ticket_medio
    )), '[]'::jsonb)
    FROM simulacoes_metas sm
    WHERE sm.ano = p_ano 
      AND sm.mes_objetivo = p_mes
      AND (p_unidade_id IS NULL OR sm.unidade_id::uuid = p_unidade_id)
  ));

  -- Leads por canal (mês atual)
  v_result := v_result || jsonb_build_object('leads_por_canal', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'canal', lc.canal,
      'total_leads', lc.total_leads,
      'matriculas', lc.matriculas,
      'taxa_conversao', lc.taxa_conversao
    ) ORDER BY lc.total_leads DESC), '[]'::jsonb)
    FROM vw_leads_por_canal lc
    WHERE lc.ano_mes = TO_CHAR(MAKE_DATE(p_ano, p_mes, 1), 'YYYY-MM')
      AND (p_unidade_id IS NULL OR lc.unidade = v_unidade_nome)
  ));

  -- Leads por curso (mês atual) - usando subquery para evitar agregação aninhada
  v_result := v_result || jsonb_build_object('leads_por_curso', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'curso', sub.curso,
      'total_leads', sub.total_leads,
      'matriculas', sub.matriculas,
      'taxa_conversao', sub.taxa_conversao
    ) ORDER BY sub.total_leads DESC), '[]'::jsonb)
    FROM (
      SELECT 
        c.nome as curso,
        COUNT(l.id) as total_leads,
        COUNT(CASE WHEN l.converteu = true THEN 1 END) as matriculas,
        ROUND(COUNT(CASE WHEN l.converteu = true THEN 1 END) * 100.0 / NULLIF(COUNT(l.id), 0), 1) as taxa_conversao
      FROM leads l
      JOIN cursos c ON l.curso_interesse_id = c.id
      WHERE EXTRACT(YEAR FROM l.data_contato) = p_ano
        AND EXTRACT(MONTH FROM l.data_contato) = p_mes
        AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      GROUP BY c.id, c.nome
      LIMIT 10
    ) sub
  ));

  -- Professores matriculadores (top 5 do mês)
  v_result := v_result || jsonb_build_object('professores_matriculadores', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', sub.professor,
      'experimentais', sub.experimentais,
      'matriculas', sub.matriculas,
      'taxa_conversao', sub.taxa_conversao
    ) ORDER BY sub.matriculas DESC), '[]'::jsonb)
    FROM (
      SELECT 
        ppe.professor,
        SUM(ppe.experimentais_realizadas) as experimentais,
        SUM(ppe.matriculas) as matriculas,
        ROUND(SUM(ppe.matriculas) * 100.0 / NULLIF(SUM(ppe.experimentais_realizadas), 0), 1) as taxa_conversao
      FROM vw_performance_professor_experimental ppe
      WHERE ppe.ano_mes = TO_CHAR(MAKE_DATE(p_ano, p_mes, 1), 'YYYY-MM')
        AND (p_unidade_id IS NULL OR ppe.unidade = v_unidade_nome)
      GROUP BY ppe.professor
      LIMIT 5
    ) sub
  ));

  -- Leads pendentes/abandonados - usando subquery
  v_result := v_result || jsonb_build_object('leads_pendentes', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'status', sub.status,
      'quantidade', sub.quantidade,
      'sem_contato_3_dias', sub.sem_contato_3_dias
    )), '[]'::jsonb)
    FROM (
      SELECT 
        l.status,
        COUNT(*) as quantidade,
        COUNT(CASE WHEN l.data_ultimo_contato < CURRENT_DATE - INTERVAL '3 days' OR l.data_ultimo_contato IS NULL THEN 1 END) as sem_contato_3_dias
      FROM leads l
      WHERE l.status NOT IN ('convertido', 'arquivado')
        AND EXTRACT(YEAR FROM l.data_contato) = p_ano
        AND EXTRACT(MONTH FROM l.data_contato) = p_mes
        AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      GROUP BY l.status
    ) sub
  ));

  -- Experimentais agendadas (próximos 7 dias)
  v_result := v_result || jsonb_build_object('experimentais_agendadas', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nome', l.nome,
      'curso', c.nome,
      'data_experimental', l.data_experimental,
      'horario', l.horario_experimental,
      'professor', p.nome
    ) ORDER BY l.data_experimental, l.horario_experimental), '[]'::jsonb)
    FROM leads l
    LEFT JOIN cursos c ON l.curso_interesse_id = c.id
    LEFT JOIN professores p ON l.professor_experimental_id = p.id
    WHERE l.experimental_agendada = true
      AND l.experimental_realizada = false
      AND l.data_experimental BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
    LIMIT 10
  ));

  -- Motivos de não matrícula (mês atual)
  v_result := v_result || jsonb_build_object('motivos_nao_matricula', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'motivo', mnm.motivo_nao_matricula,
      'quantidade', mnm.quantidade
    ) ORDER BY mnm.quantidade DESC), '[]'::jsonb)
    FROM vw_motivos_nao_matricula mnm
    WHERE mnm.ano_mes = TO_CHAR(MAKE_DATE(p_ano, p_mes, 1), 'YYYY-MM')
      AND (p_unidade_id IS NULL OR mnm.unidade = v_unidade_nome)
    LIMIT 5
  ));

  -- Lançamentos de hoje - usando subquery
  v_result := v_result || jsonb_build_object('lancamentos_hoje', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tipo', sub.tipo,
      'quantidade', sub.quantidade
    )), '[]'::jsonb)
    FROM (
      SELECT 
        ld.tipo,
        SUM(ld.quantidade) as quantidade
      FROM leads_diarios ld
      WHERE ld.data = CURRENT_DATE
        AND (p_unidade_id IS NULL OR ld.unidade_id = p_unidade_id)
      GROUP BY ld.tipo
    ) sub
  ));

  -- Acumulado do mês (leads_diarios)
  v_result := v_result || jsonb_build_object('acumulado_mes', (
    SELECT jsonb_build_object(
      'leads', COALESCE(SUM(CASE WHEN ld.tipo = 'lead' THEN ld.quantidade ELSE 0 END), 0),
      'experimentais', COALESCE(SUM(CASE WHEN ld.tipo = 'experimental' THEN ld.quantidade ELSE 0 END), 0),
      'visitas', COALESCE(SUM(CASE WHEN ld.tipo = 'visita' THEN ld.quantidade ELSE 0 END), 0),
      'matriculas', COALESCE(SUM(CASE WHEN ld.tipo = 'matricula' THEN ld.quantidade ELSE 0 END), 0)
    )
    FROM leads_diarios ld
    WHERE EXTRACT(YEAR FROM ld.data) = p_ano
      AND EXTRACT(MONTH FROM ld.data) = p_mes
      AND (p_unidade_id IS NULL OR ld.unidade_id = p_unidade_id)
  ));

  RETURN v_result;
END;
$$;
