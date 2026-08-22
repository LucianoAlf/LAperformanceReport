-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar vw_alertas_inteligentes para usar dados em tempo real
CREATE OR REPLACE VIEW vw_alertas_inteligentes AS
WITH 
-- Calcular churn em tempo real para alertas
churn_realtime AS (
  SELECT 
    u.id as unidade_id,
    u.nome as unidade_nome,
    COALESCE(em.evasoes, 0) as evasoes,
    COALESCE(ama.alunos_pagantes, 0) as alunos_anterior,
    CASE 
      WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
      THEN ROUND((COALESCE(em.evasoes, 0)::NUMERIC / ama.alunos_pagantes) * 100, 2)
      ELSE 0
    END as churn_rate
  FROM unidades u
  LEFT JOIN (
    SELECT un.id as unidade_id, COUNT(*) as evasoes
    FROM evasoes e
    JOIN unidades un ON un.nome = e.unidade
    WHERE EXTRACT(YEAR FROM e.competencia) = EXTRACT(YEAR FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM e.competencia) = EXTRACT(MONTH FROM CURRENT_DATE)
    GROUP BY un.id
  ) em ON em.unidade_id = u.id
  LEFT JOIN (
    SELECT unidade_id, alunos_pagantes
    FROM dados_mensais
    WHERE (ano = EXTRACT(YEAR FROM CURRENT_DATE) AND mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1)
       OR (ano = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND mes = 12 AND EXTRACT(MONTH FROM CURRENT_DATE) = 1)
  ) ama ON ama.unidade_id = u.id
  WHERE u.ativo = true
),
-- Ticket médio atual em tempo real
ticket_realtime AS (
  SELECT 
    a.unidade_id,
    AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) as ticket_atual
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
)
SELECT tipo_alerta, severidade, unidade_id, unidade_nome, quantidade, descricao, detalhe, valor_atual, valor_meta, data_referencia
FROM (
  -- Contratos vencendo sem renovação
  SELECT 
    'CONTRATO_VENCENDO'::text AS tipo_alerta,
    'critico'::text AS severidade,
    a.unidade_id,
    u.nome AS unidade_nome,
    count(*)::integer AS quantidade,
    'Contratos vencendo em 30 dias sem renovação'::text AS descricao,
    concat(count(*), ' alunos com contrato vencendo até ', to_char(CURRENT_DATE + INTERVAL '30 days', 'DD/MM')) AS detalhe,
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
  HAVING count(*) > 0

  UNION ALL

  -- Renovações pendentes
  SELECT 
    'RENOVACOES_PENDENTES'::text,
    'atencao'::text,
    a.unidade_id,
    u.nome,
    count(*)::integer,
    'Renovações pendentes para este mês'::text,
    concat(count(*), ' contratos vencem este mês'),
    NULL::numeric,
    NULL::numeric,
    CURRENT_DATE
  FROM alunos a
  JOIN unidades u ON a.unidade_id = u.id
  WHERE a.status = 'ativo'
    AND EXTRACT(MONTH FROM a.data_fim_contrato) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND EXTRACT(YEAR FROM a.data_fim_contrato) = EXTRACT(YEAR FROM CURRENT_DATE)
  GROUP BY a.unidade_id, u.nome
  HAVING count(*) > 0

  UNION ALL

  -- Conversão baixa (dados comerciais - já é tempo real via trigger)
  SELECT 
    'CONVERSAO_BAIXA'::text,
    CASE WHEN (dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100) < 10 THEN 'critico' ELSE 'atencao' END,
    u.id,
    u.nome,
    1,
    'Taxa de conversão abaixo da meta'::text,
    concat('Conversão: ', round((dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100), 1), '% (meta: 13.5%)'),
    round((dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100), 1),
    13.5,
    dc.competencia
  FROM dados_comerciais dc
  JOIN unidades u ON lower(u.nome) = lower(dc.unidade)
  WHERE dc.competencia = date_trunc('month', CURRENT_DATE)
    AND dc.aulas_experimentais > 0
    AND (dc.novas_matriculas_total::numeric / dc.aulas_experimentais::numeric * 100) < 13.5

  UNION ALL

  -- CHURN ALTO - AGORA EM TEMPO REAL
  SELECT 
    'CHURN_ALTO'::text,
    CASE WHEN cr.churn_rate > 6 THEN 'critico' ELSE 'atencao' END,
    cr.unidade_id,
    cr.unidade_nome,
    1,
    'Churn acima da meta mensal'::text,
    concat('Churn: ', cr.churn_rate, '% (meta: 4%)'),
    cr.churn_rate,
    4.0,
    CURRENT_DATE
  FROM churn_realtime cr
  WHERE cr.churn_rate > 4

  UNION ALL

  -- TICKET CAINDO - TEMPO REAL vs mês anterior
  SELECT 
    'TICKET_CAINDO'::text,
    'atencao'::text,
    tr.unidade_id,
    u.nome,
    1,
    'Ticket médio caindo vs mês anterior'::text,
    concat('Ticket caiu ', round(((dm.ticket_medio - tr.ticket_atual) / NULLIF(dm.ticket_medio, 0) * 100), 1), '% (R$', round(dm.ticket_medio), ' → R$', round(tr.ticket_atual), ')'),
    tr.ticket_atual,
    dm.ticket_medio,
    CURRENT_DATE
  FROM ticket_realtime tr
  JOIN unidades u ON u.id = tr.unidade_id
  JOIN dados_mensais dm ON dm.unidade_id = tr.unidade_id
    AND ((dm.ano = EXTRACT(YEAR FROM CURRENT_DATE) AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1)
      OR (dm.ano = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND dm.mes = 12 AND EXTRACT(MONTH FROM CURRENT_DATE) = 1))
  WHERE tr.ticket_atual < dm.ticket_medio

  UNION ALL

  -- Professor com turma baixa
  SELECT 
    'PROFESSOR_TURMA_BAIXA'::text,
    'informativo'::text,
    pu.unidade_id,
    u.nome,
    count(DISTINCT t.professor_id)::integer,
    'Professores com média alunos/turma baixa'::text,
    concat(count(DISTINCT t.professor_id), ' professores com média < 1.5 alunos/turma'),
    NULL::numeric,
    1.5,
    CURRENT_DATE
  FROM (
    SELECT professor_id, avg(total_alunos) as media
    FROM vw_turmas_implicitas
    GROUP BY professor_id
    HAVING avg(total_alunos) < 1.5
  ) t
  JOIN professores_unidades pu ON t.professor_id = pu.professor_id
  JOIN unidades u ON pu.unidade_id = u.id
  GROUP BY pu.unidade_id, u.nome
  HAVING count(DISTINCT t.professor_id) > 0

  UNION ALL

  -- Meta em risco
  SELECT 
    'META_EM_RISCO'::text,
    'critico'::text,
    mk.unidade_id,
    u.nome,
    1,
    concat('Meta de ', mk.tipo, ' em risco'),
    concat(mk.tipo, ': realizado abaixo de 70% da meta'),
    NULL::numeric,
    mk.valor,
    make_date(mk.ano, mk.mes, 1)
  FROM metas_kpi mk
  JOIN unidades u ON mk.unidade_id = u.id
  WHERE mk.ano = EXTRACT(YEAR FROM CURRENT_DATE)
    AND mk.mes = EXTRACT(MONTH FROM CURRENT_DATE)
    AND mk.tipo IN ('matriculas', 'alunos_ativos')
) alertas
ORDER BY 
  CASE severidade 
    WHEN 'critico' THEN 1 
    WHEN 'atencao' THEN 2 
    ELSE 3 
  END, 
  quantidade DESC;
