-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- ============================================
-- FASE 4.6: VIEWS DE KPIs COMERCIAIS
-- ============================================

-- VIEW 1: Funil de conversão por mês
CREATE OR REPLACE VIEW vw_funil_conversao_mensal AS
SELECT 
    u.nome AS unidade,
    EXTRACT(YEAR FROM l.data_contato)::INTEGER AS ano,
    EXTRACT(MONTH FROM l.data_contato)::INTEGER AS mes,
    TO_CHAR(l.data_contato, 'YYYY-MM') AS ano_mes,
    
    -- Leads
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE l.status = 'arquivado') AS leads_arquivados,
    
    -- Experimentais
    COUNT(*) FILTER (WHERE l.experimental_agendada = TRUE) AS experimentais_agendadas,
    COUNT(*) FILTER (WHERE l.experimental_realizada = TRUE) AS experimentais_realizadas,
    COUNT(*) FILTER (WHERE l.faltou_experimental = TRUE) AS faltaram,
    
    -- Conversão
    COUNT(*) FILTER (WHERE l.converteu = TRUE) AS matriculas,
    
    -- Taxas
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.experimental_agendada = TRUE) / NULLIF(COUNT(*), 0), 1) AS taxa_lead_experimental,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.converteu = TRUE) / NULLIF(COUNT(*) FILTER (WHERE l.experimental_realizada = TRUE), 0), 1) AS taxa_experimental_matricula,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.converteu = TRUE) / NULLIF(COUNT(*), 0), 1) AS taxa_lead_matricula

FROM leads l
JOIN unidades u ON l.unidade_id = u.id
GROUP BY u.nome, ano, mes, ano_mes
ORDER BY ano_mes DESC, u.nome;

-- VIEW 2: Leads por canal de origem
CREATE OR REPLACE VIEW vw_leads_por_canal AS
SELECT 
    u.nome AS unidade,
    TO_CHAR(l.data_contato, 'YYYY-MM') AS ano_mes,
    COALESCE(co.nome, 'Não informado') AS canal,
    COUNT(*) AS total_leads,
    COUNT(*) FILTER (WHERE l.converteu = TRUE) AS matriculas,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.converteu = TRUE) / NULLIF(COUNT(*), 0), 1) AS taxa_conversao
FROM leads l
JOIN unidades u ON l.unidade_id = u.id
LEFT JOIN canais_origem co ON l.canal_origem_id = co.id
GROUP BY u.nome, ano_mes, co.nome
ORDER BY ano_mes DESC, u.nome, total_leads DESC;

-- VIEW 3: Performance por professor (experimental)
CREATE OR REPLACE VIEW vw_performance_professor_experimental AS
SELECT 
    u.nome AS unidade,
    TO_CHAR(l.data_contato, 'YYYY-MM') AS ano_mes,
    p.nome AS professor,
    COUNT(*) FILTER (WHERE l.experimental_realizada = TRUE) AS experimentais_realizadas,
    COUNT(*) FILTER (WHERE l.converteu = TRUE) AS matriculas,
    ROUND(100.0 * COUNT(*) FILTER (WHERE l.converteu = TRUE) / NULLIF(COUNT(*) FILTER (WHERE l.experimental_realizada = TRUE), 0), 1) AS taxa_conversao
FROM leads l
JOIN unidades u ON l.unidade_id = u.id
LEFT JOIN professores p ON l.professor_experimental_id = p.id
WHERE l.professor_experimental_id IS NOT NULL
GROUP BY u.nome, ano_mes, p.nome
ORDER BY ano_mes DESC, taxa_conversao DESC;

-- VIEW 4: Motivos de não matrícula
CREATE OR REPLACE VIEW vw_motivos_nao_matricula AS
SELECT 
    u.nome AS unidade,
    TO_CHAR(l.data_contato, 'YYYY-MM') AS ano_mes,
    l.motivo_nao_matricula,
    COUNT(*) AS quantidade
FROM leads l
JOIN unidades u ON l.unidade_id = u.id
WHERE l.converteu = FALSE 
  AND l.experimental_realizada = TRUE
  AND l.motivo_nao_matricula IS NOT NULL
GROUP BY u.nome, ano_mes, l.motivo_nao_matricula
ORDER BY ano_mes DESC, quantidade DESC;
