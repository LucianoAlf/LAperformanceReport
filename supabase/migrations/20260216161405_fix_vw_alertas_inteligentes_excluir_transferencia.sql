-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir vw_alertas_inteligentes para excluir Transferência (tipo 4) além de Aviso Prévio (tipo 3)
CREATE OR REPLACE VIEW vw_alertas_inteligentes AS
WITH churn_realtime AS (
  SELECT 
    u.id AS unidade_id,
    u.nome AS unidade_nome,
    COALESCE(em.evasoes, 0) AS evasoes,
    COALESCE(ap.alunos_pagantes, 0) AS alunos_pagantes,
    CASE WHEN COALESCE(ap.alunos_pagantes, 0) > 0 
      THEN ROUND(COALESCE(em.evasoes, 0)::numeric / ap.alunos_pagantes * 100, 2)
      ELSE 0 
    END AS churn_rate
  FROM unidades u
  LEFT JOIN (
    SELECT e.unidade_id, COUNT(*) AS evasoes
    FROM evasoes_v2 e
    WHERE EXTRACT(year FROM e.data_evasao) = EXTRACT(year FROM CURRENT_DATE)
      AND EXTRACT(month FROM e.data_evasao) = EXTRACT(month FROM CURRENT_DATE)
      AND e.tipo_saida_id IN (1, 2) -- Apenas Cancelamentos e Não Renovações
    GROUP BY e.unidade_id
  ) em ON em.unidade_id = u.id
  LEFT JOIN (
    SELECT a.unidade_id, COUNT(*) AS alunos_pagantes
    FROM alunos a
    WHERE a.status = 'ativo' 
      AND a.valor_parcela > 0 
      AND (a.is_segundo_curso = false OR a.is_segundo_curso IS NULL)
    GROUP BY a.unidade_id
  ) ap ON ap.unidade_id = u.id
  WHERE u.ativo = true
),
ticket_realtime AS (
  SELECT 
    mrr.unidade_id,
    CASE WHEN COALESCE(pag.pagantes_unicos, 0) > 0 
      THEN mrr.mrr_total / pag.pagantes_unicos 
      ELSE 0 
    END AS ticket_atual
  FROM (
    SELECT unidade_id, SUM(valor_parcela) AS mrr_total
    FROM alunos
    WHERE status = 'ativo' AND valor_parcela > 0
    GROUP BY unidade_id
  ) mrr
  LEFT JOIN (
    SELECT unidade_id, COUNT(*) AS pagantes_unicos
    FROM alunos
    WHERE status = 'ativo' AND valor_parcela > 0 
      AND (is_segundo_curso = false OR is_segundo_curso IS NULL)
    GROUP BY unidade_id
  ) pag ON pag.unidade_id = mrr.unidade_id
)
SELECT tipo_alerta, severidade, unidade_id, unidade_nome, quantidade, descricao, detalhe, valor_atual, valor_meta, data_referencia
FROM (
  -- CONTRATO_VENCENDO
  SELECT 
    'CONTRATO_VENCENDO' AS tipo_alerta,
    'critico' AS severidade,
    a.unidade_id,
    u.nome AS unidade_nome,
    COUNT(*)::integer AS quantidade,
    'Contratos vencendo em 30 dias sem renovação' AS descricao,
    CONCAT(COUNT(*), ' alunos com contrato vencendo até ', TO_CHAR(CURRENT_DATE + INTERVAL '30 days', 'DD/MM')) AS detalhe,
    NULL::numeric AS valor_atual,
    NULL::numeric AS valor_meta,
    CURRENT_DATE AS data_referencia
  FROM alunos a
  JOIN unidades u ON a.unidade_id = u.id
  LEFT JOIN renovacoes r ON r.aluno_id = a.id AND r.data_fim_novo_contrato > a.data_fim_contrato AND r.status = 'concluida'
  WHERE a.status = 'ativo' 
    AND a.data_fim_contrato >= CURRENT_DATE 
    AND a.data_fim_contrato <= CURRENT_DATE + INTERVAL '30 days'
    AND r.id IS NULL
  GROUP BY a.unidade_id, u.nome
  HAVING COUNT(*) > 0

  UNION ALL

  -- RENOVACOES_PENDENTES
  SELECT 
    'RENOVACOES_PENDENTES',
    'atencao',
    a.unidade_id,
    u.nome,
    COUNT(*)::integer,
    'Renovações pendentes para este mês',
    CONCAT(COUNT(*), ' contratos vencem este mês'),
    NULL,
    NULL,
    CURRENT_DATE
  FROM alunos a
  JOIN unidades u ON a.unidade_id = u.id
  WHERE a.status = 'ativo' 
    AND EXTRACT(month FROM a.data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE)
    AND EXTRACT(year FROM a.data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)
  GROUP BY a.unidade_id, u.nome
  HAVING COUNT(*) > 0

  UNION ALL

  -- CONVERSAO_BAIXA
  SELECT 
    'CONVERSAO_BAIXA',
    CASE WHEN (dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0) * 100) < 10 THEN 'critico' ELSE 'atencao' END,
    u.id,
    u.nome,
    1,
    'Taxa de conversão abaixo da meta',
    CONCAT('Conversão: ', ROUND(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0) * 100, 1), '% (meta: 13.5%)'),
    ROUND(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0) * 100, 1),
    13.5,
    dc.competencia
  FROM dados_comerciais dc
  JOIN unidades u ON LOWER(u.nome) = LOWER(dc.unidade)
  WHERE dc.competencia = DATE_TRUNC('month', CURRENT_DATE)
    AND dc.aulas_experimentais > 0
    AND (dc.novas_matriculas_total::numeric / dc.aulas_experimentais * 100) < 13.5

  UNION ALL

  -- CHURN_ALTO
  SELECT 
    'CHURN_ALTO',
    CASE WHEN cr.churn_rate > 6 THEN 'critico' ELSE 'atencao' END,
    cr.unidade_id,
    cr.unidade_nome,
    1,
    'Churn acima da meta mensal',
    CONCAT('Churn: ', cr.churn_rate, '% (meta: 4%) - ', cr.evasoes, ' evasões / ', cr.alunos_pagantes, ' pagantes'),
    cr.churn_rate,
    4.0,
    CURRENT_DATE
  FROM churn_realtime cr
  WHERE cr.churn_rate > 4

  UNION ALL

  -- TICKET_CAINDO
  SELECT 
    'TICKET_CAINDO',
    'atencao',
    tr.unidade_id,
    u.nome,
    1,
    'Ticket médio caindo vs mês anterior',
    CONCAT('Ticket caiu ', ROUND((dm.ticket_medio - tr.ticket_atual) / NULLIF(dm.ticket_medio, 0) * 100, 1), '% (R$', ROUND(dm.ticket_medio), ' → R$', ROUND(tr.ticket_atual), ')'),
    tr.ticket_atual,
    dm.ticket_medio,
    CURRENT_DATE
  FROM ticket_realtime tr
  JOIN unidades u ON u.id = tr.unidade_id
  JOIN dados_mensais dm ON dm.unidade_id = tr.unidade_id 
    AND ((dm.ano = EXTRACT(year FROM CURRENT_DATE) AND dm.mes = EXTRACT(month FROM CURRENT_DATE) - 1)
      OR (dm.ano = EXTRACT(year FROM CURRENT_DATE) - 1 AND dm.mes = 12 AND EXTRACT(month FROM CURRENT_DATE) = 1))
  WHERE tr.ticket_atual < dm.ticket_medio

  UNION ALL

  -- PROFESSOR_TURMA_BAIXA
  SELECT 
    'PROFESSOR_TURMA_BAIXA',
    'informativo',
    pu.unidade_id,
    u.nome,
    COUNT(DISTINCT t.professor_id)::integer,
    'Professores com média alunos/turma baixa',
    CONCAT(COUNT(DISTINCT t.professor_id), ' professores com média < 1.5 alunos/turma'),
    NULL,
    1.5,
    CURRENT_DATE
  FROM (
    SELECT professor_id, unidade_id, AVG(total_alunos) AS media
    FROM vw_turmas_implicitas
    GROUP BY professor_id, unidade_id
    HAVING AVG(total_alunos) < 1.5
  ) t
  JOIN professores_unidades pu ON t.professor_id = pu.professor_id AND t.unidade_id = pu.unidade_id
  JOIN unidades u ON pu.unidade_id = u.id
  GROUP BY pu.unidade_id, u.nome
  HAVING COUNT(DISTINCT t.professor_id) > 0

  UNION ALL

  -- META_EM_RISCO
  SELECT 
    'META_EM_RISCO',
    'critico',
    mk.unidade_id,
    u.nome,
    1,
    CONCAT('Meta de ', mk.tipo, ' em risco'),
    CONCAT(mk.tipo, ': realizado abaixo de 70% da meta'),
    NULL,
    mk.valor,
    MAKE_DATE(mk.ano, mk.mes, 1)
  FROM metas_kpi mk
  JOIN unidades u ON mk.unidade_id = u.id
  WHERE mk.ano = EXTRACT(year FROM CURRENT_DATE)
    AND mk.mes = EXTRACT(month FROM CURRENT_DATE)
    AND mk.tipo IN ('matriculas', 'alunos_ativos')
) alertas
ORDER BY 
  CASE severidade WHEN 'critico' THEN 1 WHEN 'atencao' THEN 2 ELSE 3 END,
  quantidade DESC;
