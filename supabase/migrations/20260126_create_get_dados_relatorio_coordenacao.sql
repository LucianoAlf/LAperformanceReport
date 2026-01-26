-- Migração: Criar função get_dados_relatorio_coordenacao
-- Data: 2026-01-26
-- Descrição: Função para buscar dados do relatório de coordenação pedagógica com IA
-- Coordenadores: Quintela e Juliana
-- VERSÃO FINAL: Corrigida para buscar média_alunos_turma da vw_turmas_implicitas

-- Função para buscar dados do relatório de coordenação pedagógica
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
  -- Calcular mês anterior
  IF p_mes = 1 THEN
    v_mes_anterior := 12;
    v_ano_mes_anterior := p_ano - 1;
  ELSE
    v_mes_anterior := p_mes - 1;
    v_ano_mes_anterior := p_ano;
  END IF;

  -- Buscar nome da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  -- Período
  v_result := v_result || jsonb_build_object('periodo', jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', v_unidade_nome,
    'ano', p_ano,
    'mes', p_mes,
    'coordenadores', ARRAY['Quintela', 'Juliana']
  ));

  -- KPIs consolidados dos professores
  v_result := v_result || jsonb_build_object('kpis_professores', (
    SELECT COALESCE(jsonb_agg(row_to_json(k)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_id,
        v.professor_nome,
        v.carteira_alunos,
        v.media_alunos_turma,
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
        -- Cursos do professor
        (SELECT COALESCE(array_agg(DISTINCT c.nome), ARRAY[]::text[])
         FROM professores_cursos pc
         JOIN cursos c ON c.id = pc.curso_id
         WHERE pc.professor_id = v.professor_id) as cursos
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
      ORDER BY v.carteira_alunos DESC
    ) k
  ));

  -- Totais consolidados
  v_result := v_result || jsonb_build_object('totais', (
    SELECT row_to_json(t)
    FROM (
      SELECT 
        COUNT(DISTINCT v.professor_id) as total_professores,
        SUM(v.carteira_alunos) as total_alunos,
        ROUND(AVG(v.carteira_alunos), 1) as media_alunos_professor,
        ROUND(AVG(NULLIF(v.media_alunos_turma, 0)), 2) as media_alunos_turma,
        ROUND(AVG(v.media_presenca), 1) as media_presenca,
        ROUND(AVG(NULLIF(v.nps_medio, 0)), 1) as nps_medio,
        ROUND(AVG(v.taxa_conversao), 1) as taxa_conversao_media,
        ROUND(AVG(v.taxa_renovacao), 1) as taxa_renovacao_media,
        SUM(v.evasoes) as total_evasoes,
        SUM(v.matriculas) as total_matriculas,
        SUM(v.mrr_carteira) as mrr_total
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    ) t
  ));

  -- Top 5 professores por carteira
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

  -- Top 5 professores por média de alunos/turma
  v_result := v_result || jsonb_build_object('top_media_turma', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_nome as professor,
        v.media_alunos_turma as media,
        (SELECT COUNT(*) FROM turmas tu WHERE tu.professor_id = v.professor_id AND tu.ativo = true) as turmas
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
        AND v.media_alunos_turma > 0
      ORDER BY v.media_alunos_turma DESC
      LIMIT 5
    ) t
  ));

  -- Top 5 professores por presença
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

  -- Top 5 professores matriculadores
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

  -- Top 5 professores por retenção (tempo médio de permanência dos alunos)
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

  -- Professores em alerta (baixa presença ou evasões)
  v_result := v_result || jsonb_build_object('professores_alerta', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT 
        v.professor_id,
        v.professor_nome as professor,
        v.media_presenca as presenca,
        v.evasoes,
        v.carteira_alunos as alunos,
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

  -- Agendamentos/Treinamentos do mês
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

  -- Catálogo de treinamentos disponíveis
  v_result := v_result || jsonb_build_object('catalogo_treinamentos', (
    SELECT COALESCE(jsonb_agg(row_to_json(ct)), '[]'::jsonb)
    FROM (
      SELECT id, nome, descricao
      FROM catalogo_treinamentos
      WHERE ativo = true
      ORDER BY nome
    ) ct
  ));

  -- Metas de professores (da tabela metas_kpi com tipo de professor)
  v_result := v_result || jsonb_build_object('metas_professores', (
    SELECT COALESCE(jsonb_object_agg(mk.tipo, mk.valor), '{}'::jsonb)
    FROM metas_kpi mk
    WHERE mk.ano = p_ano AND mk.mes = p_mes
      AND (p_unidade_id IS NULL OR mk.unidade_id = p_unidade_id)
      AND mk.tipo IN ('media_alunos_turma', 'media_alunos_professor', 'taxa_renovacao_prof', 
                      'nps_medio', 'presenca_media', 'taxa_conversao_exp', 'melhor_retencao')
  ));

  -- Comparativo com mês anterior
  v_result := v_result || jsonb_build_object('mes_anterior', (
    SELECT row_to_json(t)
    FROM (
      SELECT 
        COUNT(DISTINCT v.professor_id) as total_professores,
        SUM(v.carteira_alunos) as total_alunos,
        ROUND(AVG(v.media_presenca), 1) as media_presenca,
        SUM(v.evasoes) as total_evasoes,
        SUM(v.matriculas) as total_matriculas
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = CASE WHEN p_mes = 1 THEN p_ano - 1 ELSE p_ano END
        AND v.mes = CASE WHEN p_mes = 1 THEN 12 ELSE p_mes - 1 END
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    ) t
  ));

  -- Comparativo com mesmo mês ano passado
  v_result := v_result || jsonb_build_object('ano_anterior', (
    SELECT row_to_json(t)
    FROM (
      SELECT 
        COUNT(DISTINCT v.professor_id) as total_professores,
        SUM(v.carteira_alunos) as total_alunos,
        ROUND(AVG(v.media_presenca), 1) as media_presenca,
        SUM(v.evasoes) as total_evasoes,
        SUM(v.matriculas) as total_matriculas
      FROM vw_kpis_professor_mensal v
      WHERE v.ano = p_ano - 1 AND v.mes = p_mes
        AND (p_unidade_id IS NULL OR v.unidade_id = p_unidade_id)
    ) t
  ));

  RETURN v_result;
END;
$$;

-- Comentário
COMMENT ON FUNCTION get_dados_relatorio_coordenacao IS 'Função para buscar dados do relatório de coordenação pedagógica com IA - Coordenadores: Quintela e Juliana';
