-- Migration: Atualizar função get_dados_relatorio_gerencial com todos os dados necessários
-- para o novo relatório gerencial híbrido (Template + IA)
-- Data: 26/01/2026
-- Versão: v5 (corrigido LIMIT em subqueries e responsavel_financeiro_id)

-- Adicionar coluna gerente_nome na tabela unidades (se não existir)
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS gerente_nome VARCHAR(100);

-- Atualizar gerentes por unidade
UPDATE unidades SET gerente_nome = 'Jerêh' WHERE nome = 'Campo Grande';
UPDATE unidades SET gerente_nome = 'Fabiola/Clayton' WHERE nome = 'Recreio';
UPDATE unidades SET gerente_nome = 'Krissya' WHERE nome = 'Barra';

-- Atualizar função get_dados_relatorio_gerencial com todos os dados necessários
CREATE OR REPLACE FUNCTION public.get_dados_relatorio_gerencial(
  p_unidade_id uuid DEFAULT NULL::uuid, 
  p_ano integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer, 
  p_mes integer DEFAULT (EXTRACT(month FROM CURRENT_DATE))::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
  v_mes_anterior INTEGER;
  v_ano_mes_anterior INTEGER;
  v_unidade_nome TEXT;
  v_gerente_nome TEXT;
  v_hunter_nome TEXT;
  v_farmers_nomes TEXT[];
BEGIN
  -- Calcular mês anterior
  IF p_mes = 1 THEN
    v_mes_anterior := 12;
    v_ano_mes_anterior := p_ano - 1;
  ELSE
    v_mes_anterior := p_mes - 1;
    v_ano_mes_anterior := p_ano;
  END IF;

  -- Buscar dados da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome, gerente_nome, hunter_nome, farmers_nomes 
    INTO v_unidade_nome, v_gerente_nome, v_hunter_nome, v_farmers_nomes 
    FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
    v_gerente_nome := 'Diretoria';
    v_hunter_nome := 'Equipe Comercial';
    v_farmers_nomes := ARRAY['Equipe Administrativa'];
  END IF;

  -- Construir resultado base
  v_result := jsonb_build_object(
    'periodo', jsonb_build_object(
      'ano', p_ano,
      'mes', p_mes,
      'mes_nome', TO_CHAR(TO_DATE(p_mes::TEXT, 'MM'), 'TMMonth'),
      'unidade_id', p_unidade_id,
      'unidade_nome', v_unidade_nome
    ),
    'gerente_nome', COALESCE(v_gerente_nome, 'N/D'),
    'hunter_nome', COALESCE(v_hunter_nome, 'N/D'),
    'farmers_nomes', COALESCE(v_farmers_nomes, ARRAY['N/D'])
  );

  -- KPIs de Gestão
  v_result := v_result || jsonb_build_object('kpis_gestao', (
    SELECT COALESCE(jsonb_agg(row_to_json(kg)::jsonb), '[]'::jsonb)
    FROM vw_kpis_gestao_mensal kg
    WHERE (p_unidade_id IS NULL OR kg.unidade_id = p_unidade_id)
  ));

  -- KPIs de Retenção
  v_result := v_result || jsonb_build_object('kpis_retencao', (
    SELECT COALESCE(jsonb_agg(row_to_json(kr)::jsonb), '[]'::jsonb)
    FROM vw_kpis_retencao_mensal kr
    WHERE (p_unidade_id IS NULL OR kr.unidade_id = p_unidade_id)
  ));

  -- KPIs Comerciais
  v_result := v_result || jsonb_build_object('kpis_comercial', (
    SELECT COALESCE(jsonb_agg(row_to_json(kc)::jsonb), '[]'::jsonb)
    FROM vw_kpis_comercial_mensal kc
    WHERE kc.ano = p_ano AND kc.mes = p_mes
      AND (p_unidade_id IS NULL OR kc.unidade_id = p_unidade_id)
  ));

  -- Metas do mês
  v_result := v_result || jsonb_build_object('metas', (
    SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb), '[]'::jsonb)
    FROM metas m
    WHERE m.ano = p_ano AND m.mes = p_mes
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
  ));

  -- Matrículas detalhadas
  v_result := v_result || jsonb_build_object(
    'matriculas_ativas', (
      SELECT COUNT(*) FROM alunos a 
      WHERE a.status = 'ativo' 
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    ),
    'matriculas_banda', (
      SELECT COUNT(*) FROM alunos a 
      JOIN cursos c ON a.curso_id = c.id 
      WHERE a.status = 'ativo' AND c.nome ILIKE '%banda%'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    ),
    'matriculas_2_curso', (
      SELECT COUNT(DISTINCT a.responsavel_financeiro_id) 
      FROM alunos a 
      WHERE a.status = 'ativo' 
        AND a.responsavel_financeiro_id IN (
          SELECT responsavel_financeiro_id 
          FROM alunos 
          WHERE status = 'ativo' 
          GROUP BY responsavel_financeiro_id 
          HAVING COUNT(*) > 1
        )
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    ),
    'total_bolsistas', (
      SELECT COUNT(*) FROM alunos a 
      WHERE a.status = 'ativo' AND a.classificacao IN ('bolsista_integral', 'bolsista_parcial')
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    )
  );

  -- Dados do mês anterior
  v_result := v_result || jsonb_build_object('mes_anterior', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado
    )), '[]'::jsonb)
    FROM dados_mensais dm
    WHERE dm.ano = v_ano_mes_anterior AND dm.mes = v_mes_anterior
      AND (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ));

  -- Mesmo mês ano passado
  v_result := v_result || jsonb_build_object('mesmo_mes_ano_passado', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado,
      'saldo_liquido', dm.saldo_liquido
    )), '[]'::jsonb)
    FROM dados_mensais dm
    WHERE dm.ano = p_ano - 1 AND dm.mes = p_mes
      AND (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ));

  -- Sazonalidade histórica (mesmo mês nos últimos 3 anos)
  v_result := v_result || jsonb_build_object('sazonalidade', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ano', s.ano,
      'novas_matriculas', s.novas_matriculas,
      'evasoes', s.evasoes,
      'churn_rate', s.churn_rate,
      'saldo_liquido', s.saldo_liquido
    ) ORDER BY s.ano DESC), '[]'::jsonb)
    FROM vw_sazonalidade s
    WHERE s.mes = p_mes 
      AND s.ano >= p_ano - 3 
      AND s.ano < p_ano
      AND (p_unidade_id IS NULL OR s.unidade = v_unidade_nome)
  ));

  -- Motivos de evasão
  v_result := v_result || jsonb_build_object('motivos_evasao', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'motivo', em.motivo_categoria,
      'quantidade', em.quantidade,
      'percentual', em.percentual
    ) ORDER BY em.quantidade DESC), '[]'::jsonb)
    FROM vw_evasoes_motivos em
    WHERE (p_unidade_id IS NULL OR em.unidade = v_unidade_nome)
    LIMIT 5
  ));

  -- Top 3 professores retenção
  v_result := v_result || jsonb_build_object('top_professores_retencao', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', pr.professor,
      'tempo_medio_permanencia', pr.tempo_medio_permanencia,
      'presenca_media', pr.presenca_media,
      'total_alunos', pr.total_alunos
    ) ORDER BY pr.tempo_medio_permanencia::numeric DESC), '[]'::jsonb)
    FROM vw_ranking_professores_retencao pr
    WHERE (p_unidade_id IS NULL OR pr.unidade = v_unidade_nome)
    LIMIT 3
  ));

  -- Top 3 professores matriculadores
  v_result := v_result || jsonb_build_object('top_professores_matriculadores', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor_nome', pm.professor_nome,
      'matriculas', pm.matriculas,
      'experimentais', pm.experimentais,
      'taxa_conversao', pm.taxa_conversao
    ) ORDER BY pm.matriculas DESC NULLS LAST, pm.taxa_conversao DESC NULLS LAST), '[]'::jsonb)
    FROM vw_kpis_professor_mensal pm
    WHERE pm.ano = p_ano AND pm.mes = p_mes
      AND (p_unidade_id IS NULL OR pm.unidade_id = p_unidade_id)
      AND pm.matriculas > 0
    LIMIT 3
  ));

  -- Top 3 professores presença
  v_result := v_result || jsonb_build_object('top_professores_presenca', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', pr.professor,
      'presenca_media', pr.presenca_media,
      'total_alunos', pr.total_alunos
    ) ORDER BY pr.presenca_media::numeric DESC), '[]'::jsonb)
    FROM vw_ranking_professores_retencao pr
    WHERE (p_unidade_id IS NULL OR pr.unidade = v_unidade_nome)
      AND pr.total_alunos >= 5
    LIMIT 3
  ));

  -- Cursos mais procurados
  v_result := v_result || jsonb_build_object('cursos_mais_procurados', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'curso', c.nome,
      'total_alunos', COUNT(*)
    ) ORDER BY COUNT(*) DESC), '[]'::jsonb)
    FROM alunos a
    JOIN cursos c ON a.curso_id = c.id
    WHERE a.status = 'ativo'
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
    GROUP BY c.nome
    LIMIT 5
  ));

  -- Canais com maior conversão
  v_result := v_result || jsonb_build_object('canais_maior_conversao', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'canal', co.nome,
      'total_leads', COUNT(*),
      'matriculas', SUM(CASE WHEN l.converteu = true THEN 1 ELSE 0 END),
      'taxa_conversao', ROUND(SUM(CASE WHEN l.converteu = true THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)
    ) ORDER BY ROUND(SUM(CASE WHEN l.converteu = true THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) DESC NULLS LAST), '[]'::jsonb)
    FROM leads l
    JOIN canais_origem co ON l.canal_origem_id = co.id
    WHERE l.data_contato >= (CURRENT_DATE - INTERVAL '12 months')
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
    GROUP BY co.nome
    HAVING COUNT(*) >= 5
    LIMIT 3
  ));

  -- Total indicações (canal = Indicação) no mês
  v_result := v_result || jsonb_build_object('total_indicacoes', (
    SELECT COUNT(*)
    FROM leads l
    JOIN canais_origem co ON l.canal_origem_id = co.id
    WHERE co.nome = 'Indicação'
      AND l.converteu = true
      AND EXTRACT(YEAR FROM l.data_conversao) = p_ano
      AND EXTRACT(MONTH FROM l.data_conversao) = p_mes
      AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
  ));

  -- Total pacotes Family no mês
  v_result := v_result || jsonb_build_object('total_family_pacotes', (
    SELECT COUNT(DISTINCT a.responsavel_financeiro_id)
    FROM alunos a
    WHERE a.status = 'ativo'
      AND a.data_matricula >= DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))
      AND a.data_matricula < DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1)) + INTERVAL '1 month'
      AND a.responsavel_financeiro_id IN (
        SELECT responsavel_financeiro_id
        FROM alunos
        WHERE status = 'ativo'
        GROUP BY responsavel_financeiro_id
        HAVING COUNT(*) >= 2
      )
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  ));

  -- Permanência por faixa
  v_result := v_result || jsonb_build_object('permanencia_por_faixa', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'faixa', sub.faixa,
      'quantidade', sub.quantidade,
      'percentual', sub.percentual
    ) ORDER BY sub.ordem), '[]'::jsonb)
    FROM (
      SELECT 
        CASE 
          WHEN a.tempo_permanencia_meses < 6 THEN '0-6 meses'
          WHEN a.tempo_permanencia_meses < 12 THEN '6-12 meses'
          WHEN a.tempo_permanencia_meses < 24 THEN '1-2 anos'
          WHEN a.tempo_permanencia_meses < 36 THEN '2-3 anos'
          ELSE '3+ anos'
        END as faixa,
        CASE 
          WHEN a.tempo_permanencia_meses < 6 THEN 1
          WHEN a.tempo_permanencia_meses < 12 THEN 2
          WHEN a.tempo_permanencia_meses < 24 THEN 3
          WHEN a.tempo_permanencia_meses < 36 THEN 4
          ELSE 5
        END as ordem,
        COUNT(*)::INTEGER as quantidade,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER(), 0), 1)::NUMERIC as percentual
      FROM alunos a
      WHERE a.status = 'ativo' AND a.classificacao = 'pagante'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY faixa, ordem
    ) sub
  ));

  -- Dados do mês atual
  v_result := v_result || jsonb_build_object('dados_mes_atual', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'alunos_pagantes', dm.alunos_pagantes,
      'churn_rate', dm.churn_rate,
      'ticket_medio', dm.ticket_medio,
      'taxa_renovacao', dm.taxa_renovacao,
      'inadimplencia', dm.inadimplencia,
      'tempo_permanencia', dm.tempo_permanencia,
      'reajuste_parcelas', dm.reajuste_parcelas,
      'novas_matriculas', dm.novas_matriculas,
      'evasoes', dm.evasoes,
      'faturamento_estimado', dm.faturamento_estimado,
      'saldo_liquido', dm.saldo_liquido
    )), '[]'::jsonb)
    FROM dados_mensais dm
    WHERE dm.ano = p_ano AND dm.mes = p_mes
      AND (p_unidade_id IS NULL OR dm.unidade_id = p_unidade_id)
  ));

  RETURN v_result;
END;
$function$;
