-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.8: VIEWS CONSOLIDADAS E ALERTAS
-- ============================================

-- VIEW 1: Dashboard resumo por unidade
CREATE OR REPLACE VIEW vw_dashboard_unidade AS
SELECT 
    u.nome AS unidade,
    u.id AS unidade_id,
    
    -- Alunos (da tabela alunos)
    COUNT(a.id) FILTER (WHERE a.status = 'ativo') AS alunos_ativos,
    COUNT(a.id) FILTER (WHERE a.status = 'ativo' AND tm.conta_como_pagante = TRUE) AS alunos_pagantes,
    COUNT(a.id) FILTER (WHERE a.status = 'ativo' AND tm.codigo = 'BOLSISTA_INT') AS bolsistas_integral,
    COUNT(a.id) FILTER (WHERE a.status = 'ativo' AND tm.codigo = 'BOLSISTA_PARC') AS bolsistas_parcial,
    
    -- Ticket médio (só pagantes que entram no cálculo)
    ROUND(AVG(a.valor_parcela) FILTER (WHERE a.status = 'ativo' AND tm.entra_ticket_medio = TRUE), 2) AS ticket_medio,
    
    -- Faturamento previsto
    ROUND(SUM(a.valor_parcela) FILTER (WHERE a.status = 'ativo' AND tm.conta_como_pagante = TRUE), 2) AS faturamento_previsto,
    
    -- Tempo médio de permanência (alunos ativos)
    ROUND(AVG(a.tempo_permanencia_meses) FILTER (WHERE a.status = 'ativo'), 1) AS tempo_medio_permanencia

FROM unidades u
LEFT JOIN alunos a ON u.id = a.unidade_id
LEFT JOIN tipos_matricula tm ON a.tipo_matricula_id = tm.id
GROUP BY u.id, u.nome
ORDER BY u.nome;

-- VIEW 2: Ranking de professores por retenção
CREATE OR REPLACE VIEW vw_ranking_professores_retencao AS
SELECT 
    u.nome AS unidade,
    p.nome AS professor,
    COUNT(a.id) AS total_alunos,
    COUNT(a.id) FILTER (WHERE a.status = 'ativo') AS alunos_ativos,
    COUNT(a.id) FILTER (WHERE a.is_ex_aluno = TRUE) AS alunos_perdidos,
    ROUND(AVG(a.tempo_permanencia_meses), 1) AS tempo_medio_permanencia,
    ROUND(AVG(a.percentual_presenca), 1) AS presenca_media,
    ROUND(AVG(a.valor_parcela) FILTER (WHERE a.status = 'ativo'), 2) AS ticket_medio
FROM professores p
JOIN alunos a ON p.id = a.professor_atual_id
JOIN unidades u ON a.unidade_id = u.id
GROUP BY u.nome, p.nome
HAVING COUNT(a.id) >= 3 -- Mínimo de 3 alunos para entrar no ranking
ORDER BY u.nome, tempo_medio_permanencia DESC;

-- VIEW 3: Alertas e insights
CREATE OR REPLACE VIEW vw_alertas AS
SELECT 
    'CHURN_ALTO' AS tipo_alerta,
    u.nome AS unidade,
    'Churn acima de 5%' AS descricao,
    rd.churn_rate_mes AS valor,
    rd.data_referencia
FROM relatorios_diarios rd
JOIN unidades u ON rd.unidade_id = u.id
WHERE rd.churn_rate_mes > 5
  AND rd.data_referencia >= CURRENT_DATE - INTERVAL '30 days'

UNION ALL

SELECT 
    'RENOVACAO_BAIXA' AS tipo_alerta,
    u.nome AS unidade,
    'Taxa de renovação abaixo de 70%' AS descricao,
    rd.taxa_renovacao_mes AS valor,
    rd.data_referencia
FROM relatorios_diarios rd
JOIN unidades u ON rd.unidade_id = u.id
WHERE rd.taxa_renovacao_mes < 70
  AND rd.data_referencia >= CURRENT_DATE - INTERVAL '30 days'

UNION ALL

SELECT 
    'INADIMPLENCIA_ALTA' AS tipo_alerta,
    u.nome AS unidade,
    'Inadimplência acima de 10%' AS descricao,
    rd.inadimplencia_percentual AS valor,
    rd.data_referencia
FROM relatorios_diarios rd
JOIN unidades u ON rd.unidade_id = u.id
WHERE rd.inadimplencia_percentual > 10
  AND rd.data_referencia >= CURRENT_DATE - INTERVAL '30 days'

ORDER BY data_referencia DESC;

-- VIEW 4: Resumo de renovações por mês
CREATE OR REPLACE VIEW vw_renovacoes_mensal AS
SELECT 
    u.nome AS unidade,
    EXTRACT(YEAR FROM r.data_renovacao)::INTEGER AS ano,
    EXTRACT(MONTH FROM r.data_renovacao)::INTEGER AS mes,
    TO_CHAR(r.data_renovacao, 'YYYY-MM') AS ano_mes,
    COUNT(*) FILTER (WHERE r.status = 'renovado') AS renovacoes,
    COUNT(*) FILTER (WHERE r.status = 'nao_renovou') AS nao_renovacoes,
    COUNT(*) FILTER (WHERE r.status = 'pendente') AS pendentes,
    COUNT(*) FILTER (WHERE r.status = 'negociando') AS negociando,
    ROUND(AVG(r.percentual_reajuste) FILTER (WHERE r.status = 'renovado'), 2) AS reajuste_medio,
    ROUND(100.0 * COUNT(*) FILTER (WHERE r.status = 'renovado') / NULLIF(COUNT(*), 0), 1) AS taxa_renovacao
FROM renovacoes r
JOIN unidades u ON r.unidade_id = u.id
GROUP BY u.nome, ano, mes, ano_mes
ORDER BY ano_mes DESC, u.nome;
