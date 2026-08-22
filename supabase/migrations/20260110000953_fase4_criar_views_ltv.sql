-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View que calcula LTV automaticamente por unidade
CREATE OR REPLACE VIEW vw_ltv_por_unidade AS
SELECT 
    u.nome AS unidade,
    COUNT(*) AS total_alunos,
    SUM(ah.tempo_permanencia_meses) AS soma_meses,
    ROUND(AVG(ah.tempo_permanencia_meses)::numeric, 1) AS ltv_meses,
    ROUND((AVG(ah.tempo_permanencia_meses) / 12)::numeric, 2) AS ltv_anos
FROM alunos_historico ah
JOIN unidades u ON ah.unidade_id = u.id
GROUP BY u.id, u.nome
ORDER BY ltv_meses DESC;

-- View LTV consolidado da rede
CREATE OR REPLACE VIEW vw_ltv_rede AS
SELECT 
    COUNT(*) AS total_alunos,
    SUM(tempo_permanencia_meses) AS soma_meses,
    ROUND(AVG(tempo_permanencia_meses)::numeric, 1) AS ltv_meses,
    ROUND((AVG(tempo_permanencia_meses) / 12)::numeric, 2) AS ltv_anos
FROM alunos_historico;

-- View LTV por categoria de saída
CREATE OR REPLACE VIEW vw_ltv_por_categoria AS
SELECT 
    categoria_saida,
    COUNT(*) AS total_alunos,
    ROUND(AVG(tempo_permanencia_meses)::numeric, 1) AS ltv_meses
FROM alunos_historico
WHERE categoria_saida IS NOT NULL AND categoria_saida != 'Sem categoria'
GROUP BY categoria_saida
ORDER BY ltv_meses DESC;

-- View distribuição por faixa de tempo
CREATE OR REPLACE VIEW vw_distribuicao_permanencia AS
SELECT 
    CASE 
        WHEN tempo_permanencia_meses BETWEEN 4 AND 6 THEN '04-06 meses'
        WHEN tempo_permanencia_meses BETWEEN 7 AND 12 THEN '07-12 meses'
        WHEN tempo_permanencia_meses BETWEEN 13 AND 24 THEN '13-24 meses'
        WHEN tempo_permanencia_meses BETWEEN 25 AND 36 THEN '25-36 meses'
        WHEN tempo_permanencia_meses BETWEEN 37 AND 48 THEN '37-48 meses'
        ELSE '49+ meses'
    END AS faixa,
    COUNT(*) AS quantidade,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) AS percentual
FROM alunos_historico
GROUP BY 1
ORDER BY MIN(tempo_permanencia_meses);
