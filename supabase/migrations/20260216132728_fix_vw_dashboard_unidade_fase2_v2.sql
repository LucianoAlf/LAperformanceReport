-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir vw_dashboard_unidade com todas as regras de negócio corretas:
-- 1. matriculas_mes = novos únicos pagantes (sem 2º curso, sem bolsistas)
-- 2. evasoes_mes = excluir Aviso Prévio (tipo_saida_id IN 1,2)
-- 3. taxa_renovacao = usar movimentacoes_admin (fonte de verdade)
-- 4. ticket_medio = SUM(parcelas) / COUNT(alunos únicos pagantes)

CREATE OR REPLACE VIEW vw_dashboard_unidade AS
WITH 
-- Alunos ativos por unidade
alunos_ativos AS (
  SELECT 
    a.unidade_id,
    COUNT(*) FILTER (WHERE a.is_segundo_curso IS NULL OR a.is_segundo_curso = false) AS total_ativos,
    COUNT(*) FILTER (WHERE tm.conta_como_pagante = true AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) AS total_pagantes,
    -- CORREÇÃO: Ticket médio = SUM(parcelas de todos) / COUNT(alunos únicos pagantes)
    CASE 
      WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0 AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)) > 0 
      THEN SUM(a.valor_parcela) FILTER (WHERE a.valor_parcela > 0) / 
           COUNT(*) FILTER (WHERE a.valor_parcela > 0 AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false))
      ELSE 0
    END AS ticket_medio,
    SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true AND COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS mrr
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
  GROUP BY a.unidade_id
),

-- Tempo de permanência
permanencia_combinada AS (
  SELECT unidade_id AS uid, tempo_permanencia_meses AS meses
  FROM alunos_historico
  WHERE tempo_permanencia_meses >= 4
  UNION ALL
  SELECT a.unidade_id, a.tempo_permanencia_meses
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('inativo', 'evadido')
    AND a.tempo_permanencia_meses >= 4
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
),

permanencia_calc AS (
  SELECT 
    uid AS unidade_id,
    ROUND(AVG(meses), 1) AS tempo_permanencia_medio
  FROM permanencia_combinada
  GROUP BY uid
),

-- CORREÇÃO: Evasões do mês (excluindo Aviso Prévio)
evasoes_dedup AS (
  SELECT DISTINCT ON (COALESCE(e.aluno_id, -e.id), e.unidade_id)
    COALESCE(e.aluno_id, -e.id) AS aluno_key,
    e.unidade_id
  FROM evasoes_v2 e
  LEFT JOIN alunos a ON a.id = e.aluno_id
  WHERE EXTRACT(YEAR FROM e.data_evasao) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM e.data_evasao) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND e.tipo_saida_id IN (1, 2)
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
  ORDER BY COALESCE(e.aluno_id, -e.id), e.unidade_id
),

evasoes_mes AS (
  SELECT unidade_id, COUNT(*) AS evasoes_realtime
  FROM evasoes_dedup
  GROUP BY unidade_id
),

-- CORREÇÃO: Matrículas do mês = novos únicos pagantes
matriculas_mes AS (
  SELECT 
    a.unidade_id,
    COUNT(*) AS matriculas_realtime
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.data_matricula IS NOT NULL
    AND EXTRACT(YEAR FROM a.data_matricula) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM a.data_matricula) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false)
    AND (tm.conta_como_pagante = true OR tm.id IS NULL)
  GROUP BY a.unidade_id
),

-- CORREÇÃO: Renovações do mês (usar movimentacoes_admin)
renovacoes_mes AS (
  SELECT 
    m.unidade_id,
    COUNT(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes_realtime,
    COUNT(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS total_contratos,
    -- Calcular reajuste médio a partir dos valores
    AVG(
      CASE 
        WHEN m.tipo = 'renovacao' AND m.valor_parcela_anterior > 0 
        THEN ((m.valor_parcela_novo - m.valor_parcela_anterior) / m.valor_parcela_anterior) * 100
        ELSE NULL
      END
    ) AS reajuste_medio
  FROM movimentacoes_admin m
  WHERE EXTRACT(YEAR FROM m.data) = EXTRACT(YEAR FROM CURRENT_DATE)
    AND EXTRACT(MONTH FROM m.data) = EXTRACT(MONTH FROM CURRENT_DATE)
    AND m.tipo IN ('renovacao', 'nao_renovacao')
  GROUP BY m.unidade_id
),

-- Alunos do mês anterior
alunos_mes_anterior AS (
  SELECT unidade_id, alunos_pagantes
  FROM dados_mensais
  WHERE (ano = EXTRACT(YEAR FROM CURRENT_DATE) AND mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1)
     OR (ano = EXTRACT(YEAR FROM CURRENT_DATE) - 1 AND mes = 12 AND EXTRACT(MONTH FROM CURRENT_DATE) = 1)
  GROUP BY unidade_id, alunos_pagantes
),

-- Inadimplência atual
inadimplencia_atual AS (
  SELECT 
    a.unidade_id,
    COUNT(*) FILTER (WHERE a.status_pagamento = 'inadimplente') AS qtd_inadimplentes,
    COUNT(*) FILTER (WHERE COALESCE(a.status_pagamento, '') <> 'sem_parcela') AS total_pagantes_calc
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('ativo', 'trancado')
    AND (tm.conta_como_pagante = true OR tm.id IS NULL)
  GROUP BY a.unidade_id
)

SELECT 
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  u.codigo,
  COALESCE(aa.total_ativos, 0)::INTEGER AS alunos_ativos,
  COALESCE(aa.total_pagantes, 0)::INTEGER AS alunos_pagantes,
  COALESCE(aa.ticket_medio, 0)::NUMERIC(10,2) AS ticket_medio,
  COALESCE(aa.mrr, 0)::NUMERIC(12,2) AS mrr,
  COALESCE(mm.matriculas_realtime, 0)::INTEGER AS matriculas_mes,
  COALESCE(em.evasoes_realtime, 0)::INTEGER AS evasoes_mes,
  CASE 
    WHEN COALESCE(ama.alunos_pagantes, 0) > 0 
    THEN ROUND(COALESCE(em.evasoes_realtime, 0)::NUMERIC / ama.alunos_pagantes * 100, 2)
    WHEN COALESCE(aa.total_pagantes, 0) > 0 
    THEN ROUND(COALESCE(em.evasoes_realtime, 0)::NUMERIC / aa.total_pagantes * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS churn_rate,
  CASE 
    WHEN COALESCE(rm.total_contratos, 0) > 0 
    THEN ROUND(COALESCE(rm.renovacoes_realtime, 0)::NUMERIC / rm.total_contratos * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS taxa_renovacao,
  CASE 
    WHEN COALESCE(ia.total_pagantes_calc, 0) > 0 
    THEN ROUND(COALESCE(ia.qtd_inadimplentes, 0)::NUMERIC / ia.total_pagantes_calc * 100, 2)
    ELSE 0
  END::NUMERIC(5,2) AS inadimplencia_pct,
  COALESCE(pc.tempo_permanencia_medio, 0)::NUMERIC(5,1) AS tempo_permanencia,
  COALESCE(rm.reajuste_medio, 0)::NUMERIC(5,2) AS reajuste_medio
FROM unidades u
LEFT JOIN alunos_ativos aa ON aa.unidade_id = u.id
LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id
LEFT JOIN alunos_mes_anterior ama ON ama.unidade_id = u.id
LEFT JOIN inadimplencia_atual ia ON ia.unidade_id = u.id
WHERE u.ativo = true;
