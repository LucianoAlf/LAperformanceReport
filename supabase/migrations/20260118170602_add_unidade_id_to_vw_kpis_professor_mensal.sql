-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar view para incluir unidade_id
DROP VIEW IF EXISTS vw_kpis_professor_mensal;

CREATE OR REPLACE VIEW vw_kpis_professor_mensal AS
WITH carteira AS (
    SELECT 
        a.professor_atual_id AS professor_id,
        a.unidade_id,
        COUNT(*) AS carteira_alunos,
        AVG(a.valor_parcela) AS ticket_medio,
        AVG(a.percentual_presenca) AS media_presenca,
        SUM(a.valor_parcela) AS mrr_carteira
    FROM alunos a
    WHERE a.status = 'ativo' AND a.professor_atual_id IS NOT NULL
    GROUP BY a.professor_atual_id, a.unidade_id
),
experimentais AS (
    SELECT 
        ld.professor_experimental_id AS professor_id,
        ld.unidade_id,
        EXTRACT(YEAR FROM ld.data)::INTEGER AS ano,
        EXTRACT(MONTH FROM ld.data)::INTEGER AS mes,
        SUM(CASE WHEN ld.tipo = 'experimental_realizada' THEN ld.quantidade ELSE 0 END) AS experimentais,
        SUM(CASE WHEN ld.tipo = 'matricula' THEN ld.quantidade ELSE 0 END) AS matriculas_leads
    FROM leads_diarios ld
    WHERE ld.professor_experimental_id IS NOT NULL
    GROUP BY ld.professor_experimental_id, ld.unidade_id, EXTRACT(YEAR FROM ld.data), EXTRACT(MONTH FROM ld.data)
),
matriculas_mes AS (
    SELECT 
        a.professor_experimental_id AS professor_id,
        a.unidade_id,
        EXTRACT(YEAR FROM a.data_matricula)::INTEGER AS ano,
        EXTRACT(MONTH FROM a.data_matricula)::INTEGER AS mes,
        COUNT(*) AS matriculas
    FROM alunos a
    WHERE a.professor_experimental_id IS NOT NULL AND a.data_matricula IS NOT NULL
    GROUP BY a.professor_experimental_id, a.unidade_id, EXTRACT(YEAR FROM a.data_matricula), EXTRACT(MONTH FROM a.data_matricula)
),
renovacoes_mes AS (
    SELECT 
        r.professor_id,
        r.unidade_id,
        EXTRACT(YEAR FROM r.data_renovacao)::INTEGER AS ano,
        EXTRACT(MONTH FROM r.data_renovacao)::INTEGER AS mes,
        COUNT(*) FILTER (WHERE r.status = 'realizada') AS renovacoes,
        COUNT(*) FILTER (WHERE r.status = 'nao_renovada') AS nao_renovacoes,
        COUNT(*) AS total_renovacoes
    FROM renovacoes r
    WHERE r.professor_id IS NOT NULL
    GROUP BY r.professor_id, r.unidade_id, EXTRACT(YEAR FROM r.data_renovacao), EXTRACT(MONTH FROM r.data_renovacao)
),
evasoes_mes AS (
    SELECT 
        ev.professor_id,
        ev.unidade_id,
        EXTRACT(YEAR FROM ev.data_evasao)::INTEGER AS ano,
        EXTRACT(MONTH FROM ev.data_evasao)::INTEGER AS mes,
        COUNT(*) AS evasoes,
        SUM(ev.valor_parcela) AS mrr_perdido
    FROM evasoes_v2 ev
    WHERE ev.professor_id IS NOT NULL
    GROUP BY ev.professor_id, ev.unidade_id, EXTRACT(YEAR FROM ev.data_evasao), EXTRACT(MONTH FROM ev.data_evasao)
)
SELECT 
    p.id AS professor_id,
    p.nome AS professor_nome,
    COALESCE(c.unidade_id, e.unidade_id, m.unidade_id) AS unidade_id,
    COALESCE(e.ano, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AS ano,
    COALESCE(e.mes, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER) AS mes,
    COALESCE(c.carteira_alunos, 0)::INTEGER AS carteira_alunos,
    COALESCE(c.ticket_medio, 0)::NUMERIC(10,2) AS ticket_medio,
    COALESCE(c.media_presenca, 0)::NUMERIC(5,2) AS media_presenca,
    COALESCE(100 - c.media_presenca, 0)::NUMERIC(5,2) AS taxa_faltas,
    COALESCE(c.mrr_carteira, 0)::NUMERIC(12,2) AS mrr_carteira,
    COALESCE(p.nps_medio, 0)::NUMERIC(5,2) AS nps_medio,
    COALESCE(p.media_alunos_turma, 0)::NUMERIC(5,2) AS media_alunos_turma,
    COALESCE(e.experimentais, 0)::INTEGER AS experimentais,
    COALESCE(m.matriculas, e.matriculas_leads, 0)::INTEGER AS matriculas,
    CASE 
        WHEN COALESCE(e.experimentais, 0) > 0 
        THEN ROUND(COALESCE(m.matriculas, e.matriculas_leads, 0)::NUMERIC / e.experimentais * 100, 2)
        ELSE 0 
    END AS taxa_conversao,
    COALESCE(r.renovacoes, 0)::INTEGER AS renovacoes,
    COALESCE(r.nao_renovacoes, 0)::INTEGER AS nao_renovacoes,
    CASE 
        WHEN COALESCE(r.total_renovacoes, 0) > 0 
        THEN ROUND(r.renovacoes::NUMERIC / r.total_renovacoes * 100, 2)
        ELSE 0 
    END AS taxa_renovacao,
    COALESCE(ev.evasoes, 0)::INTEGER AS evasoes,
    COALESCE(ev.mrr_perdido, 0)::NUMERIC(12,2) AS mrr_perdido,
    CASE 
        WHEN COALESCE(c.carteira_alunos, 0) > 0 
        THEN ROUND(COALESCE(ev.evasoes, 0)::NUMERIC / c.carteira_alunos * 100, 2)
        ELSE 0 
    END AS taxa_cancelamento,
    RANK() OVER (ORDER BY CASE WHEN COALESCE(e.experimentais, 0) > 0 THEN COALESCE(m.matriculas, 0)::NUMERIC / e.experimentais ELSE 0 END DESC) AS ranking_matriculador,
    RANK() OVER (ORDER BY CASE WHEN COALESCE(r.total_renovacoes, 0) > 0 THEN r.renovacoes::NUMERIC / r.total_renovacoes ELSE 0 END DESC) AS ranking_renovador,
    RANK() OVER (ORDER BY CASE WHEN COALESCE(c.carteira_alunos, 0) > 0 THEN COALESCE(ev.evasoes, 0)::NUMERIC / c.carteira_alunos ELSE 1 END) AS ranking_churn
FROM professores p
LEFT JOIN carteira c ON c.professor_id = p.id
LEFT JOIN experimentais e ON e.professor_id = p.id
LEFT JOIN matriculas_mes m ON m.professor_id = p.id AND m.ano = e.ano AND m.mes = e.mes AND m.unidade_id = e.unidade_id
LEFT JOIN renovacoes_mes r ON r.professor_id = p.id AND r.ano = COALESCE(e.ano, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AND r.mes = COALESCE(e.mes, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER)
LEFT JOIN evasoes_mes ev ON ev.professor_id = p.id AND ev.ano = COALESCE(e.ano, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) AND ev.mes = COALESCE(e.mes, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER)
WHERE p.ativo = true;
