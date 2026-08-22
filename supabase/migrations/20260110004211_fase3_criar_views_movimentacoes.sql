-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- VIEWS DE ANÁLISE DE MOVIMENTAÇÕES
-- ============================================

-- VIEW 1: Resumo mensal de movimentações
CREATE OR REPLACE VIEW vw_movimentacoes_mensal AS
SELECT 
    u.nome AS unidade,
    EXTRACT(YEAR FROM m.data_movimentacao)::INTEGER AS ano,
    EXTRACT(MONTH FROM m.data_movimentacao)::INTEGER AS mes,
    TO_CHAR(m.data_movimentacao, 'YYYY-MM') AS ano_mes,
    m.tipo,
    COUNT(*) AS quantidade
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
GROUP BY u.nome, ano, mes, ano_mes, m.tipo
ORDER BY ano DESC, mes DESC, u.nome, m.tipo;

-- VIEW 2: KPIs mensais por unidade
CREATE OR REPLACE VIEW vw_kpis_mensais AS
SELECT 
    u.nome AS unidade,
    TO_CHAR(m.data_movimentacao, 'YYYY-MM') AS ano_mes,
    SUM(CASE WHEN m.tipo = 'matricula' THEN 1 ELSE 0 END) AS matriculas,
    SUM(CASE WHEN m.tipo = 'renovacao' THEN 1 ELSE 0 END) AS renovacoes,
    SUM(CASE WHEN m.tipo = 'evasao' THEN 1 ELSE 0 END) AS evasoes,
    SUM(CASE WHEN m.tipo = 'transferencia' THEN 1 ELSE 0 END) AS transferencias
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
GROUP BY u.nome, ano_mes
ORDER BY ano_mes DESC, u.nome;

-- VIEW 3: Taxa de evasão por motivo
CREATE OR REPLACE VIEW vw_evasao_por_motivo AS
SELECT 
    u.nome AS unidade,
    COALESCE(ms.nome, 'Não informado') AS motivo,
    COUNT(*) AS quantidade,
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY u.nome), 0), 1) AS percentual
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
LEFT JOIN motivos_saida ms ON m.motivo_saida_id = ms.id
WHERE m.tipo = 'evasao'
GROUP BY u.nome, ms.nome
ORDER BY u.nome, quantidade DESC;

-- VIEW 4: Taxa de evasão por tipo (Interrompido vs Não renovou)
CREATE OR REPLACE VIEW vw_evasao_por_tipo AS
SELECT 
    u.nome AS unidade,
    COALESCE(ts.nome, 'Não informado') AS tipo_saida,
    COUNT(*) AS quantidade,
    ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY u.nome), 0), 1) AS percentual
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
LEFT JOIN tipos_saida ts ON m.tipo_saida_id = ts.id
WHERE m.tipo = 'evasao'
GROUP BY u.nome, ts.nome
ORDER BY u.nome, quantidade DESC;

-- VIEW 5: Matrículas por canal de origem
CREATE OR REPLACE VIEW vw_matriculas_por_canal AS
SELECT 
    u.nome AS unidade,
    TO_CHAR(m.data_movimentacao, 'YYYY-MM') AS ano_mes,
    COALESCE(co.nome, 'Não informado') AS canal_origem,
    COUNT(*) AS quantidade
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
LEFT JOIN canais_origem co ON m.canal_origem_id = co.id
WHERE m.tipo = 'matricula'
GROUP BY u.nome, ano_mes, co.nome
ORDER BY ano_mes DESC, u.nome, quantidade DESC;

-- VIEW 6: Movimentações recentes (últimos 30 dias)
CREATE OR REPLACE VIEW vw_movimentacoes_recentes AS
SELECT 
    m.id,
    a.nome AS aluno,
    u.nome AS unidade,
    c.nome AS curso,
    m.tipo,
    m.data_movimentacao,
    ms.nome AS motivo_saida,
    m.observacoes,
    m.created_by
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
LEFT JOIN alunos a ON m.aluno_id = a.id
LEFT JOIN cursos c ON m.curso_id = c.id
LEFT JOIN motivos_saida ms ON m.motivo_saida_id = ms.id
WHERE m.data_movimentacao >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY m.data_movimentacao DESC, m.created_at DESC;

-- VIEW 7: Evolução de alunos (saldo mensal)
CREATE OR REPLACE VIEW vw_evolucao_alunos AS
SELECT 
    u.nome AS unidade,
    TO_CHAR(m.data_movimentacao, 'YYYY-MM') AS ano_mes,
    SUM(CASE WHEN m.tipo = 'matricula' THEN 1 ELSE 0 END) AS entradas,
    SUM(CASE WHEN m.tipo = 'evasao' THEN 1 ELSE 0 END) AS saidas,
    SUM(CASE WHEN m.tipo = 'matricula' THEN 1 ELSE 0 END) - SUM(CASE WHEN m.tipo = 'evasao' THEN 1 ELSE 0 END) AS saldo
FROM movimentacoes m
JOIN unidades u ON m.unidade_id = u.id
GROUP BY u.nome, ano_mes
ORDER BY ano_mes, u.nome;
