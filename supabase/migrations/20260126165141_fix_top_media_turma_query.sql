-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir query do top_media_turma
CREATE OR REPLACE FUNCTION get_dados_relatorio_coordenacao(
  p_unidade_id UUID,
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_unidade_nome TEXT;
  v_mes_anterior INTEGER;
  v_ano_mes_anterior INTEGER;
BEGIN
  IF p_mes = 1 THEN
    v_mes_anterior := 12;
    v_ano_mes_anterior := p_ano - 1;
  ELSE
    v_mes_anterior := p_mes - 1;
    v_ano_mes_anterior := p_ano;
  END IF;

  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  v_result := v_result || jsonb_build_object('periodo', jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', v_unidade_nome,
    'ano', p_ano,
    'mes', p_mes,
    'coordenadores', ARRAY['Quintela', 'Juliana']
  ));

  v_result := v_result || jsonb_build_object('kpis_professores', (
    SELECT COALESCE(jsonb_agg(row_to_json(k)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_id,
        v.professor_nome,
        v.carteira_alunos,
        COALESCE((
          SELECT ROUND(AVG(ti.total_alunos), 2)
          FROM vw_turmas_implicitas ti
          WHERE ti.professor_id = v.professor_id
            AND (p_unidade_id IS NULL OR ti.unidade_id = p_unidade_id)
        ), 0) as media_alunos_turma,
        v.media_presenca,
        v.nps_medio,
        v.taxa_conversao,
        v.taxa_renovacao,
        v.evasoes,
        v.matriculas,
        v.mrr_carteira,
        v.ranking_matriculador,
        v.ranking_renovador,
        v.ranking_churn,
        (SELECT COALESCE(array_agg(DISTINCT c.nome), ARRAY[]::text[])
         FROM professores_cursos pc
         JOIN cursos c ON c.id = pc.curso_id
         WHERE pc.professor_id = v.professor_id) as cursos,
        0 as health_score,
        'critico' as health_status
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
      ORDER BY v.carteira_alunos DESC
    ) k
  ));

  v_result := v_result || jsonb_build_object('totais', (
    SELECT row_to_json(t)
    FROM (
      SELECT 
        COUNT(DISTINCT v.professor_id) as total_professores,
        SUM(v.carteira_alunos) as total_alunos,
        ROUND(AVG(v.carteira_alunos), 1) as media_alunos_professor,
        COALESCE((
          SELECT ROUND(AVG(ti.total_alunos), 2)
          FROM vw_turmas_implicitas ti
          WHERE (p_unidade_id IS NULL OR ti.unidade_id = p_unidade_id)
        ), 0) as media_alunos_turma,
        (SELECT COUNT(*) FROM vw_turmas_implicitas ti 
         WHERE (p_unidade_id IS NULL OR ti.unidade_id = p_unidade_id)) as total_turmas,
        ROUND(AVG(v.media_presenca), 1) as media_presenca,
        ROUND(AVG(NULLIF(v.nps_medio, 0)), 1) as nps_medio,
        ROUND(AVG(v.taxa_conversao), 1) as taxa_conversao_media,
        ROUND(AVG(v.taxa_renovacao), 1) as taxa_renovacao_media,
        SUM(v.evasoes) as total_evasoes,
        SUM(v.matriculas) as total_matriculas,
        SUM(v.mrr_carteira) as mrr_total,
        SUM(v.renovacoes) as renovacoes_realizadas,
        ROUND(AVG(NULLIF(v.taxa_cancelamento, 0)), 1) as churn_medio_professor,
        0 as health_score_medio
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    ) t
  ));

  v_result := v_result || jsonb_build_object('top_carteira', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_nome as professor,
        v.carteira_alunos as alunos
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
      ORDER BY v.carteira_alunos DESC
      LIMIT 5
    ) t
  ));

  v_result := v_result || jsonb_build_object('top_health_score', '[]'::jsonb);

  v_result := v_result || jsonb_build_object('top_media_turma', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        p.nome as professor,
        ROUND(AVG(ti.total_alunos), 2) as media,
        COUNT(*) as turmas
      FROM vw_turmas_implicitas ti
      JOIN professores p ON p.id = ti.professor_id
      WHERE (p_unidade_id IS NULL OR ti.unidade_id = p_unidade_id)
      GROUP BY p.id, p.nome
      HAVING COUNT(*) > 0
      ORDER BY AVG(ti.total_alunos) DESC
      LIMIT 5
    ) t
  ));

  v_result := v_result || jsonb_build_object('top_presenca', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_nome as professor,
        v.media_presenca as presenca
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
      ORDER BY v.media_presenca DESC
      LIMIT 5
    ) t
  ));

  v_result := v_result || jsonb_build_object('top_matriculadores', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_nome as professor,
        v.matriculas
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
        AND v.matriculas > 0
      ORDER BY v.matriculas DESC
      LIMIT 5
    ) t
  ));

  v_result := v_result || jsonb_build_object('top_retencao', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        p.nome as professor,
        ROUND(AVG(a.tempo_permanencia_meses), 1) as tempo_medio
      FROM alunos a
      JOIN professores p ON a.professor_atual_id = p.id
      WHERE a.status = 'ativo'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY p.id, p.nome
      HAVING COUNT(*) >= 3
      ORDER BY AVG(a.tempo_permanencia_meses) DESC
      LIMIT 5
    ) t
  ));

  v_result := v_result || jsonb_build_object('professores_alerta', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_id,
        v.professor_nome as professor,
        v.media_presenca as presenca,
        v.evasoes,
        v.carteira_alunos as alunos,
        0 as health_score,
        CASE 
          WHEN v.media_presenca < 70 OR v.evasoes > 2 THEN 'critico'
          WHEN v.media_presenca < 80 OR v.evasoes > 0 THEN 'atencao'
          ELSE 'ok'
        END as status
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
        AND (v.media_presenca < 80 OR v.evasoes > 0)
      ORDER BY v.media_presenca ASC
    ) t
  ));

  v_result := v_result || jsonb_build_object('agenda', (
    SELECT row_to_json(a)
    FROM (
      SELECT 
        (SELECT COUNT(*) FROM professor_acoes pa 
         WHERE pa.tipo = 'treinamento' 
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano 
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) as treinamentos_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa 
         WHERE pa.tipo = 'reuniao' 
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano 
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) as reunioes_agendadas,
        (SELECT COUNT(*) FROM professor_acoes pa 
         WHERE pa.tipo = 'checkpoint' 
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano 
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) as checkpoints_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa 
         WHERE pa.status = 'concluido' 
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano 
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) as concluidos,
        (SELECT COUNT(*) FROM professor_acoes pa 
         WHERE pa.status = 'pendente' 
           AND pa.data_agendada < CURRENT_DATE
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)) as atrasados
    ) a
  ));

  v_result := v_result || jsonb_build_object('professores_em_treinamento', (
    SELECT COALESCE(jsonb_agg(row_to_json(pt)), '[]'::jsonb)
    FROM (
      SELECT 
        p.nome as professor,
        pa.titulo as treinamento,
        pa.data_agendada,
        pa.status
      FROM professor_acoes pa
      JOIN professores p ON pa.professor_id = p.id
      WHERE pa.tipo = 'treinamento'
        AND pa.status IN ('pendente', 'em_andamento')
        AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
      ORDER BY pa.data_agendada
      LIMIT 10
    ) pt
  ));

  v_result := v_result || jsonb_build_object('catalogo_treinamentos', (
    SELECT COALESCE(jsonb_agg(row_to_json(ct)), '[]'::jsonb)
    FROM (
      SELECT id, nome, descricao
      FROM catalogo_treinamentos
      WHERE ativo = true
      ORDER BY nome
    ) ct
  ));

  v_result := v_result || jsonb_build_object('metas_professores', COALESCE(
    (SELECT jsonb_object_agg(mk.tipo, mk.valor)
     FROM metas_kpi mk
     WHERE mk.ano = p_ano AND mk.mes = p_mes
       AND (p_unidade_id IS NULL OR mk.unidade_id = p_unidade_id)
       AND mk.tipo IN ('media_alunos_turma', 'media_alunos_professor', 'taxa_renovacao_prof', 
                       'nps_medio', 'presenca_media', 'taxa_conversao_exp', 'melhor_retencao')),
    '{}'::jsonb
  ));

  v_result := v_result || jsonb_build_object('mes_anterior', (
    SELECT row_to_json(t)
    FROM (
      SELECT 
        COUNT(DISTINCT v.professor_id) as total_professores,
        SUM(v.carteira_alunos) as total_alunos,
        ROUND(AVG(v.media_presenca), 1) as media_presenca,
        SUM(v.evasoes) as total_evasoes,
        SUM(v.matriculas) as total_matriculas,
        0 as health_score_medio,
        0 as professores_criticos
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = v_ano_mes_anterior AND v.mes = v_mes_anterior
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    ) t
  ));

  v_result := v_result || jsonb_build_object('ano_anterior', (
    SELECT row_to_json(t)
    FROM (
      SELECT 
        COUNT(DISTINCT v.professor_id) as total_professores,
        SUM(v.carteira_alunos) as total_alunos,
        ROUND(AVG(v.media_presenca), 1) as media_presenca,
        SUM(v.evasoes) as total_evasoes,
        SUM(v.matriculas) as total_matriculas,
        ROUND(AVG(v.carteira_alunos), 1) as media_alunos_professor
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano - 1 AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    ) t
  ));

  RETURN v_result;
END;
$$;
