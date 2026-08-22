-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir vw_alertas_inteligentes para usar as mesmas fontes do Analytics
-- Alunos pagantes = sem segundo curso, valor > 0
-- Evasões = excluindo Aviso Prévio (tipo_saida_id = 3)

CREATE OR REPLACE VIEW vw_alertas_inteligentes AS
WITH churn_realtime AS (
  SELECT 
    u.id AS unidade_id,
    u.nome AS unidade_nome,
    COALESCE(em.evasoes, 0) AS evasoes,
    COALESCE(ap.alunos_pagantes, 0) AS alunos_pagantes,
    CASE
      WHEN COALESCE(ap.alunos_pagantes, 0) > 0 
      THEN round(COALESCE(em.evasoes, 0)::numeric / ap.alunos_pagantes::numeric * 100::numeric, 2)
      ELSE 0::numeric
    END AS churn_rate
  FROM unidades u
  LEFT JOIN (
    -- CORREÇÃO: Evasões do mês atual, excluindo Aviso Prévio (tipo_saida_id = 3)
    SELECT 
      e.unidade_id,
      count(*) AS evasoes
    FROM evasoes_v2 e
    WHERE EXTRACT(year FROM e.data_evasao) = EXTRACT(year FROM CURRENT_DATE) 
      AND EXTRACT(month FROM e.data_evasao) = EXTRACT(month FROM CURRENT_DATE)
      AND (e.tipo_saida_id != 3 OR e.tipo_saida_id IS NULL)
    GROUP BY e.unidade_id
  ) em ON em.unidade_id = u.id
  LEFT JOIN (
    -- CORREÇÃO: Alunos pagantes atuais (sem segundo curso, valor > 0)
    SELECT 
      a.unidade_id,
      count(*) AS alunos_pagantes
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
    a.unidade_id,
    -- CORREÇÃO: Ticket médio dos pagantes únicos (sem segundo curso)
    avg(a.valor_parcela) FILTER (
      WHERE a.valor_parcela > 0 
        AND (a.is_segundo_curso = false OR a.is_segundo_curso IS NULL)
    ) AS ticket_atual
  FROM alunos a
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
)
SELECT tipo_alerta, severidade, unidade_id, unidade_nome, quantidade, descricao, detalhe, valor_atual, valor_meta, data_referencia
FROM (
  -- CONTRATO_VENCENDO
  SELECT 
    'CONTRATO_VENCENDO'::text AS tipo_alerta,
    'critico'::text AS severidade,
    a.unidade_id,
    u.nome AS unidade_nome,
    count(*)::integer AS quantidade,
    'Contratos vencendo em 30 dias sem renovação'::text AS descricao,
    concat(count(*), ' alunos com contrato vencendo até ', to_char(CURRENT_DATE + '30 days'::interval, 'DD/MM'::text)) AS detalhe,
    NULL::numeric AS valor_atual,
    NULL::numeric AS valor_meta,
    CURRENT_DATE AS data_referencia
  FROM alunos a
  JOIN unidades u ON a.unidade_id = u.id
  LEFT JOIN renovacoes r ON r.aluno_id = a.id AND r.data_fim_novo_contrato > a.data_fim_contrato AND r.status = 'concluida'
  WHERE a.status = 'ativo' 
    AND a.data_fim_contrato >= CURRENT_DATE 
    AND a.data_fim_contrato <= (CURRENT_DATE + '30 days'::interval) 
    AND r.id IS NULL
  GROUP BY a.unidade_id, u.nome
  HAVING count(*) > 0

  UNION ALL

  -- RENOVACOES_PENDENTES
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
    AND EXTRACT(month FROM a.data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE) 
    AND EXTRACT(year FROM a.data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)
  GROUP BY a.unidade_id, u.nome
  HAVING count(*) > 0

  UNION ALL

  -- CONVERSAO_BAIXA
  SELECT 
    'CONVERSAO_BAIXA'::text,
    CASE
      WHEN (dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100) < 10 THEN 'critico'::text
      ELSE 'atencao'::text
    END,
    u.id,
    u.nome,
    1,
    'Taxa de conversão abaixo da meta'::text,
    concat('Conversão: ', round(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100, 1), '% (meta: 13.5%)'),
    round(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100, 1),
    13.5,
    dc.competencia
  FROM dados_comerciais dc
  JOIN unidades u ON lower(u.nome) = lower(dc.unidade)
  WHERE dc.competencia = date_trunc('month', CURRENT_DATE)
    AND dc.aulas_experimentais > 0 
    AND (dc.novas_matriculas_total::numeric / dc.aulas_experimentais::numeric * 100) < 13.5

  UNION ALL

  -- CHURN_ALTO (usando fontes corretas do Analytics)
  SELECT 
    'CHURN_ALTO'::text,
    CASE
      WHEN cr.churn_rate > 6 THEN 'critico'::text
      ELSE 'atencao'::text
    END,
    cr.unidade_id,
    cr.unidade_nome,
    1,
    'Churn acima da meta mensal'::text,
    concat('Churn: ', cr.churn_rate, '% (meta: 4%) - ', cr.evasoes, ' evasões / ', cr.alunos_pagantes, ' pagantes'),
    cr.churn_rate,
    4.0,
    CURRENT_DATE
  FROM churn_realtime cr
  WHERE cr.churn_rate > 4

  UNION ALL

  -- TICKET_CAINDO
  SELECT 
    'TICKET_CAINDO'::text,
    'atencao'::text,
    tr.unidade_id,
    u.nome,
    1,
    'Ticket médio caindo vs mês anterior'::text,
    concat('Ticket caiu ', round((dm.ticket_medio - tr.ticket_atual) / NULLIF(dm.ticket_medio, 0) * 100, 1), '% (R$', round(dm.ticket_medio), ' → R$', round(tr.ticket_atual), ')'),
    tr.ticket_atual,
    dm.ticket_medio,
    CURRENT_DATE
  FROM ticket_realtime tr
  JOIN unidades u ON u.id = tr.unidade_id
  JOIN dados_mensais dm ON dm.unidade_id = tr.unidade_id 
    AND ((dm.ano::numeric = EXTRACT(year FROM CURRENT_DATE) AND dm.mes::numeric = (EXTRACT(month FROM CURRENT_DATE) - 1))
      OR (dm.ano::numeric = (EXTRACT(year FROM CURRENT_DATE) - 1) AND dm.mes = 12 AND EXTRACT(month FROM CURRENT_DATE) = 1))
  WHERE tr.ticket_atual < dm.ticket_medio

  UNION ALL

  -- PROFESSOR_TURMA_BAIXA
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
    SELECT professor_id, unidade_id, avg(total_alunos) AS media
    FROM vw_turmas_implicitas
    GROUP BY professor_id, unidade_id
    HAVING avg(total_alunos) < 1.5
  ) t
  JOIN professores_unidades pu ON t.professor_id = pu.professor_id AND t.unidade_id = pu.unidade_id
  JOIN unidades u ON pu.unidade_id = u.id
  GROUP BY pu.unidade_id, u.nome
  HAVING count(DISTINCT t.professor_id) > 0

  UNION ALL

  -- META_EM_RISCO
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
  WHERE mk.ano::numeric = EXTRACT(year FROM CURRENT_DATE) 
    AND mk.mes::numeric = EXTRACT(month FROM CURRENT_DATE) 
    AND mk.tipo = ANY (ARRAY['matriculas', 'alunos_ativos'])
) alertas
ORDER BY 
  CASE severidade
    WHEN 'critico' THEN 1
    WHEN 'atencao' THEN 2
    ELSE 3
  END, 
  quantidade DESC;
