-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir vw_alertas_inteligentes para usar evasoes_v2 em vez de evasoes_legacy
-- A tabela evasoes_v2 é a fonte correta de evasões

CREATE OR REPLACE VIEW vw_alertas_inteligentes AS
WITH churn_realtime AS (
  SELECT 
    u.id AS unidade_id,
    u.nome AS unidade_nome,
    COALESCE(em.evasoes, 0::bigint) AS evasoes,
    COALESCE(ama.alunos_pagantes, 0) AS alunos_anterior,
    CASE
      WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
      THEN round(COALESCE(em.evasoes, 0::bigint)::numeric / ama.alunos_pagantes::numeric * 100::numeric, 2)
      ELSE 0::numeric
    END AS churn_rate
  FROM unidades u
  LEFT JOIN (
    -- CORREÇÃO: Usar evasoes_v2 em vez de evasoes_legacy
    SELECT 
      e.unidade_id,
      count(*) AS evasoes
    FROM evasoes_v2 e
    WHERE EXTRACT(year FROM e.data_evasao) = EXTRACT(year FROM CURRENT_DATE) 
      AND EXTRACT(month FROM e.data_evasao) = EXTRACT(month FROM CURRENT_DATE)
    GROUP BY e.unidade_id
  ) em ON em.unidade_id = u.id
  LEFT JOIN (
    SELECT dados_mensais.unidade_id, dados_mensais.alunos_pagantes
    FROM dados_mensais
    WHERE (dados_mensais.ano::numeric = EXTRACT(year FROM CURRENT_DATE) 
           AND dados_mensais.mes::numeric = (EXTRACT(month FROM CURRENT_DATE) - 1::numeric))
       OR (dados_mensais.ano::numeric = (EXTRACT(year FROM CURRENT_DATE) - 1::numeric) 
           AND dados_mensais.mes = 12 
           AND EXTRACT(month FROM CURRENT_DATE) = 1::numeric)
  ) ama ON ama.unidade_id = u.id
  WHERE u.ativo = true
),
ticket_realtime AS (
  SELECT 
    a.unidade_id,
    avg(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_atual
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status::text = 'ativo'::text
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
  LEFT JOIN renovacoes r ON r.aluno_id = a.id AND r.data_fim_novo_contrato > a.data_fim_contrato AND r.status::text = 'concluida'::text
  WHERE a.status::text = 'ativo'::text 
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
  WHERE a.status::text = 'ativo'::text 
    AND EXTRACT(month FROM a.data_fim_contrato) = EXTRACT(month FROM CURRENT_DATE) 
    AND EXTRACT(year FROM a.data_fim_contrato) = EXTRACT(year FROM CURRENT_DATE)
  GROUP BY a.unidade_id, u.nome
  HAVING count(*) > 0

  UNION ALL

  -- CONVERSAO_BAIXA
  SELECT 
    'CONVERSAO_BAIXA'::text,
    CASE
      WHEN (dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100::numeric) < 10::numeric THEN 'critico'::text
      ELSE 'atencao'::text
    END,
    u.id,
    u.nome,
    1,
    'Taxa de conversão abaixo da meta'::text,
    concat('Conversão: ', round(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100::numeric, 1), '% (meta: 13.5%)'),
    round(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0)::numeric * 100::numeric, 1),
    13.5,
    dc.competencia
  FROM dados_comerciais dc
  JOIN unidades u ON lower(u.nome::text) = lower(dc.unidade::text)
  WHERE dc.competencia = date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) 
    AND dc.aulas_experimentais > 0 
    AND (dc.novas_matriculas_total::numeric / dc.aulas_experimentais::numeric * 100::numeric) < 13.5

  UNION ALL

  -- CHURN_ALTO (usando evasoes_v2)
  SELECT 
    'CHURN_ALTO'::text,
    CASE
      WHEN cr.churn_rate > 6::numeric THEN 'critico'::text
      ELSE 'atencao'::text
    END,
    cr.unidade_id,
    cr.unidade_nome,
    1,
    'Churn acima da meta mensal'::text,
    concat('Churn: ', cr.churn_rate, '% (meta: 4%)'),
    cr.churn_rate,
    4.0,
    CURRENT_DATE
  FROM churn_realtime cr
  WHERE cr.churn_rate > 4::numeric

  UNION ALL

  -- TICKET_CAINDO
  SELECT 
    'TICKET_CAINDO'::text,
    'atencao'::text,
    tr.unidade_id,
    u.nome,
    1,
    'Ticket médio caindo vs mês anterior'::text,
    concat('Ticket caiu ', round((dm.ticket_medio - tr.ticket_atual) / NULLIF(dm.ticket_medio, 0::numeric) * 100::numeric, 1), '% (R$', round(dm.ticket_medio), ' → R$', round(tr.ticket_atual), ')'),
    tr.ticket_atual,
    dm.ticket_medio,
    CURRENT_DATE
  FROM ticket_realtime tr
  JOIN unidades u ON u.id = tr.unidade_id
  JOIN dados_mensais dm ON dm.unidade_id = tr.unidade_id 
    AND ((dm.ano::numeric = EXTRACT(year FROM CURRENT_DATE) AND dm.mes::numeric = (EXTRACT(month FROM CURRENT_DATE) - 1::numeric))
      OR (dm.ano::numeric = (EXTRACT(year FROM CURRENT_DATE) - 1::numeric) AND dm.mes = 12 AND EXTRACT(month FROM CURRENT_DATE) = 1::numeric))
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
    SELECT professor_id, avg(total_alunos) AS media
    FROM vw_turmas_implicitas
    GROUP BY professor_id
    HAVING avg(total_alunos) < 1.5
  ) t
  JOIN professores_unidades pu ON t.professor_id = pu.professor_id
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
    AND mk.tipo::text = ANY (ARRAY['matriculas'::text, 'alunos_ativos'::text])
) alertas
ORDER BY 
  CASE severidade
    WHEN 'critico' THEN 1
    WHEN 'atencao' THEN 2
    ELSE 3
  END, 
  quantidade DESC;
