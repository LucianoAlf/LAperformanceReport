-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View para calcular a Taxa de Crescimento por Professor
-- Fórmula: ((matriculas - evasoes - nao_renovacoes) / alunos_iniciais) * 100 * fator_demanda
CREATE OR REPLACE VIEW vw_taxa_crescimento_professor AS
WITH periodo AS (
    SELECT 
        DATE_TRUNC('month', CURRENT_DATE) AS inicio_mes,
        DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day' AS fim_mes,
        EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS ano,
        EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER AS mes
),
-- Alunos iniciais do mês (ativos antes do início do mês atual)
alunos_iniciais AS (
    SELECT 
        a.professor_atual_id AS professor_id,
        a.unidade_id,
        COUNT(*) AS quantidade
    FROM alunos a, periodo p
    WHERE a.status = 'ativo'
      AND a.professor_atual_id IS NOT NULL
      AND a.data_matricula < p.inicio_mes
    GROUP BY a.professor_atual_id, a.unidade_id
),
-- Matrículas do mês (por professor experimental)
matriculas_mes AS (
    SELECT 
        a.professor_experimental_id AS professor_id,
        a.unidade_id,
        COUNT(*) AS quantidade
    FROM alunos a, periodo p
    WHERE a.professor_experimental_id IS NOT NULL
      AND a.data_matricula >= p.inicio_mes
      AND a.data_matricula <= p.fim_mes
    GROUP BY a.professor_experimental_id, a.unidade_id
),
-- Evasões do mês (tipo 1=interrompido, 3=aviso prévio)
evasoes_mes AS (
    SELECT 
        e.professor_id,
        e.unidade_id,
        COUNT(*) AS quantidade
    FROM evasoes_v2 e, periodo p
    WHERE e.professor_id IS NOT NULL
      AND e.data_evasao >= p.inicio_mes
      AND e.data_evasao <= p.fim_mes
      AND e.tipo_saida_id IN (1, 3)
    GROUP BY e.professor_id, e.unidade_id
),
-- Não renovações do mês (tipo 2)
nao_renovacoes_mes AS (
    SELECT 
        e.professor_id,
        e.unidade_id,
        COUNT(*) AS quantidade
    FROM evasoes_v2 e, periodo p
    WHERE e.professor_id IS NOT NULL
      AND e.data_evasao >= p.inicio_mes
      AND e.data_evasao <= p.fim_mes
      AND e.tipo_saida_id = 2
    GROUP BY e.professor_id, e.unidade_id
)
SELECT 
    p.id AS professor_id,
    p.nome AS professor_nome,
    COALESCE(fdp.unidade_id, ai.unidade_id, mm.unidade_id) AS unidade_id,
    per.ano,
    per.mes,
    
    -- Dados brutos
    COALESCE(ai.quantidade, 0)::INTEGER AS alunos_iniciais,
    COALESCE(mm.quantidade, 0)::INTEGER AS matriculas_mes,
    COALESCE(em.quantidade, 0)::INTEGER AS evasoes_mes,
    COALESCE(nr.quantidade, 0)::INTEGER AS nao_renovacoes_mes,
    
    -- Fator de demanda ponderado
    COALESCE(fdp.fator_demanda_ponderado, 1.0) AS fator_demanda_ponderado,
    
    -- Taxa de crescimento bruta (%)
    CASE 
        WHEN COALESCE(ai.quantidade, 0) > 0 THEN
            ROUND(
                ((COALESCE(mm.quantidade, 0) - COALESCE(em.quantidade, 0) - COALESCE(nr.quantidade, 0))::DECIMAL 
                / ai.quantidade) * 100
            , 2)
        ELSE 0
    END AS taxa_crescimento_bruta,
    
    -- Taxa de crescimento ajustada (com fator de demanda)
    CASE 
        WHEN COALESCE(ai.quantidade, 0) > 0 THEN
            ROUND(
                ((COALESCE(mm.quantidade, 0) - COALESCE(em.quantidade, 0) - COALESCE(nr.quantidade, 0))::DECIMAL 
                / ai.quantidade) * 100 * COALESCE(fdp.fator_demanda_ponderado, 1.0)
            , 2)
        ELSE 0
    END AS taxa_crescimento_ajustada,
    
    -- Pontos normalizados (0-100)
    -- Fórmula: ((taxa_ajustada + 10) / 30) * 100, limitado entre 0 e 100
    CASE 
        WHEN COALESCE(ai.quantidade, 0) > 0 THEN
            GREATEST(0, LEAST(100, 
                ROUND(
                    ((
                        ((COALESCE(mm.quantidade, 0) - COALESCE(em.quantidade, 0) - COALESCE(nr.quantidade, 0))::DECIMAL 
                        / ai.quantidade) * 100 * COALESCE(fdp.fator_demanda_ponderado, 1.0)
                    ) + 10) / 30 * 100
                , 2)
            ))
        ELSE 33.33 -- Valor neutro para professores sem alunos iniciais
    END AS pontos_crescimento

FROM professores p
CROSS JOIN periodo per
LEFT JOIN vw_fator_demanda_professor fdp ON fdp.professor_id = p.id
LEFT JOIN alunos_iniciais ai ON ai.professor_id = p.id AND ai.unidade_id = fdp.unidade_id
LEFT JOIN matriculas_mes mm ON mm.professor_id = p.id AND mm.unidade_id = COALESCE(fdp.unidade_id, ai.unidade_id)
LEFT JOIN evasoes_mes em ON em.professor_id = p.id AND em.unidade_id = COALESCE(fdp.unidade_id, ai.unidade_id)
LEFT JOIN nao_renovacoes_mes nr ON nr.professor_id = p.id AND nr.unidade_id = COALESCE(fdp.unidade_id, ai.unidade_id)
WHERE p.ativo = true;

COMMENT ON VIEW vw_taxa_crescimento_professor IS 'Calcula a Taxa de Crescimento por Professor com Fator de Demanda Ponderado';
