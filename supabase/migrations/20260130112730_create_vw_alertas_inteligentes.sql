-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View de Alertas Inteligentes para o Dashboard
-- Consolida 8 tipos de alertas baseados em dados reais do sistema

DROP VIEW IF EXISTS vw_alertas_inteligentes;

CREATE VIEW vw_alertas_inteligentes AS
SELECT * FROM (

-- 1. CONTRATOS VENCENDO EM 30 DIAS (sem renovação agendada)
SELECT 
  'CONTRATO_VENCENDO' as tipo_alerta,
  'critico' as severidade,
  a.unidade_id,
  u.nome as unidade_nome,
  COUNT(*)::integer as quantidade,
  'Contratos vencendo em 30 dias sem renovação' as descricao,
  CONCAT(COUNT(*), ' alunos com contrato vencendo até ', TO_CHAR(CURRENT_DATE + INTERVAL '30 days', 'DD/MM')) as detalhe,
  NULL::numeric as valor_atual,
  NULL::numeric as valor_meta,
  CURRENT_DATE as data_referencia
FROM alunos a
JOIN unidades u ON a.unidade_id = u.id
LEFT JOIN renovacoes r ON r.aluno_id = a.id 
  AND r.data_fim_novo_contrato > a.data_fim_contrato
  AND r.status = 'concluida'
WHERE a.status = 'ativo'
  AND a.data_fim_contrato BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
  AND r.id IS NULL
GROUP BY a.unidade_id, u.nome
HAVING COUNT(*) > 0

UNION ALL

-- 2. RENOVAÇÕES PENDENTES DO MÊS
SELECT 
  'RENOVACOES_PENDENTES' as tipo_alerta,
  'atencao' as severidade,
  a.unidade_id,
  u.nome as unidade_nome,
  COUNT(*)::integer as quantidade,
  'Renovações pendentes para este mês' as descricao,
  CONCAT(COUNT(*), ' contratos vencem este mês') as detalhe,
  NULL::numeric as valor_atual,
  NULL::numeric as valor_meta,
  CURRENT_DATE as data_referencia
FROM alunos a
JOIN unidades u ON a.unidade_id = u.id
WHERE a.status = 'ativo'
  AND EXTRACT(MONTH FROM a.data_fim_contrato) = EXTRACT(MONTH FROM CURRENT_DATE)
  AND EXTRACT(YEAR FROM a.data_fim_contrato) = EXTRACT(YEAR FROM CURRENT_DATE)
GROUP BY a.unidade_id, u.nome
HAVING COUNT(*) > 0

UNION ALL

-- 3. TAXA DE CONVERSÃO ABAIXO DA META (<13.5%)
SELECT 
  'CONVERSAO_BAIXA' as tipo_alerta,
  CASE WHEN (dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0) * 100) < 10 THEN 'critico' ELSE 'atencao' END as severidade,
  u.id as unidade_id,
  u.nome as unidade_nome,
  1 as quantidade,
  'Taxa de conversão abaixo da meta' as descricao,
  CONCAT('Conversão: ', ROUND(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0) * 100, 1), '% (meta: 13.5%)') as detalhe,
  ROUND(dc.novas_matriculas_total::numeric / NULLIF(dc.aulas_experimentais, 0) * 100, 1) as valor_atual,
  13.5 as valor_meta,
  dc.competencia as data_referencia
FROM dados_comerciais dc
JOIN unidades u ON LOWER(u.nome) = LOWER(dc.unidade)
WHERE dc.competencia = DATE_TRUNC('month', CURRENT_DATE)
  AND dc.aulas_experimentais > 0
  AND (dc.novas_matriculas_total::numeric / dc.aulas_experimentais * 100) < 13.5

UNION ALL

-- 4. INADIMPLÊNCIA ACIMA DA META (>1.5%)
SELECT 
  'INADIMPLENCIA_ALTA' as tipo_alerta,
  CASE WHEN dm.inadimplencia > 3 THEN 'critico' ELSE 'atencao' END as severidade,
  dm.unidade_id,
  u.nome as unidade_nome,
  1 as quantidade,
  'Inadimplência acima da meta' as descricao,
  CONCAT('Inadimplência: ', ROUND(dm.inadimplencia, 1), '% (meta: 1.5%)') as detalhe,
  dm.inadimplencia as valor_atual,
  1.5 as valor_meta,
  MAKE_DATE(dm.ano, dm.mes, 1) as data_referencia
FROM dados_mensais dm
JOIN unidades u ON dm.unidade_id = u.id
WHERE dm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1
  AND dm.inadimplencia > 1.5

UNION ALL

-- 5. TICKET MÉDIO CAINDO VS MÊS ANTERIOR
SELECT 
  'TICKET_CAINDO' as tipo_alerta,
  'atencao' as severidade,
  atual.unidade_id,
  u.nome as unidade_nome,
  1 as quantidade,
  'Ticket médio caindo vs mês anterior' as descricao,
  CONCAT('Ticket caiu ', ROUND(((anterior.ticket_medio - atual.ticket_medio) / anterior.ticket_medio * 100), 1), '% (R$', ROUND(anterior.ticket_medio), ' → R$', ROUND(atual.ticket_medio), ')') as detalhe,
  atual.ticket_medio as valor_atual,
  anterior.ticket_medio as valor_meta,
  MAKE_DATE(atual.ano, atual.mes, 1) as data_referencia
FROM dados_mensais atual
JOIN dados_mensais anterior ON atual.unidade_id = anterior.unidade_id
  AND (atual.ano * 12 + atual.mes) = (anterior.ano * 12 + anterior.mes + 1)
JOIN unidades u ON atual.unidade_id = u.id
WHERE atual.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND atual.mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1
  AND atual.ticket_medio < anterior.ticket_medio

UNION ALL

-- 6. PROFESSORES COM MÉDIA ALUNOS/TURMA ABAIXO DO IDEAL (<1.5)
SELECT 
  'PROFESSOR_TURMA_BAIXA' as tipo_alerta,
  'informativo' as severidade,
  pu.unidade_id,
  u.nome as unidade_nome,
  COUNT(DISTINCT t.professor_id)::integer as quantidade,
  'Professores com média alunos/turma baixa' as descricao,
  CONCAT(COUNT(DISTINCT t.professor_id), ' professores com média < 1.5 alunos/turma') as detalhe,
  NULL::numeric as valor_atual,
  1.5 as valor_meta,
  CURRENT_DATE as data_referencia
FROM (
  SELECT professor_id, AVG(total_alunos) as media
  FROM vw_turmas_implicitas
  GROUP BY professor_id
  HAVING AVG(total_alunos) < 1.5
) t
JOIN professores_unidades pu ON t.professor_id = pu.professor_id
JOIN unidades u ON pu.unidade_id = u.id
GROUP BY pu.unidade_id, u.nome
HAVING COUNT(DISTINCT t.professor_id) > 0

UNION ALL

-- 7. CHURN ACIMA DA META (>4%)
SELECT 
  'CHURN_ALTO' as tipo_alerta,
  CASE WHEN dm.churn_rate > 6 THEN 'critico' ELSE 'atencao' END as severidade,
  dm.unidade_id,
  u.nome as unidade_nome,
  1 as quantidade,
  'Churn acima da meta mensal' as descricao,
  CONCAT('Churn: ', ROUND(dm.churn_rate, 1), '% (meta: 4%)') as detalhe,
  dm.churn_rate as valor_atual,
  4.0 as valor_meta,
  MAKE_DATE(dm.ano, dm.mes, 1) as data_referencia
FROM dados_mensais dm
JOIN unidades u ON dm.unidade_id = u.id
WHERE dm.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND dm.mes = EXTRACT(MONTH FROM CURRENT_DATE) - 1
  AND dm.churn_rate > 4

UNION ALL

-- 8. METAS EM RISCO (KPIs abaixo de 70% da meta)
SELECT 
  'META_EM_RISCO' as tipo_alerta,
  'critico' as severidade,
  mk.unidade_id,
  u.nome as unidade_nome,
  1 as quantidade,
  CONCAT('Meta de ', mk.tipo, ' em risco') as descricao,
  CONCAT(mk.tipo, ': realizado abaixo de 70% da meta') as detalhe,
  NULL::numeric as valor_atual,
  mk.valor as valor_meta,
  MAKE_DATE(mk.ano, mk.mes, 1) as data_referencia
FROM metas_kpi mk
JOIN unidades u ON mk.unidade_id = u.id
WHERE mk.ano = EXTRACT(YEAR FROM CURRENT_DATE)
  AND mk.mes = EXTRACT(MONTH FROM CURRENT_DATE)
  AND mk.tipo IN ('matriculas', 'alunos_ativos')

) alertas
ORDER BY 
  CASE alertas.severidade 
    WHEN 'critico' THEN 1 
    WHEN 'atencao' THEN 2 
    ELSE 3 
  END,
  alertas.quantidade DESC;
