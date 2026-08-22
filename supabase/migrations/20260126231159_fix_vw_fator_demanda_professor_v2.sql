-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Dropar e recriar a view com tipo correto
DROP VIEW IF EXISTS vw_fator_demanda_professor;

CREATE VIEW vw_fator_demanda_professor AS
WITH alunos_por_curso AS (
    SELECT 
        a.professor_atual_id AS professor_id,
        a.unidade_id,
        a.curso_id,
        c.nome AS curso_nome,
        COALESCE(c.fator_demanda, 1.0) AS fator_demanda_curso,
        COUNT(*) AS quantidade_alunos
    FROM alunos a
    JOIN cursos c ON c.id = a.curso_id
    WHERE a.status = 'ativo' 
      AND a.professor_atual_id IS NOT NULL
      AND a.curso_id IS NOT NULL
    GROUP BY a.professor_atual_id, a.unidade_id, a.curso_id, c.nome, c.fator_demanda
),
totais_professor AS (
    SELECT 
        professor_id,
        unidade_id,
        SUM(quantidade_alunos) AS total_alunos
    FROM alunos_por_curso
    GROUP BY professor_id, unidade_id
)
SELECT 
    p.id AS professor_id,
    p.nome AS professor_nome,
    tp.unidade_id,
    COALESCE(tp.total_alunos, 0)::INTEGER AS total_alunos,
    -- Fator de demanda ponderado: Σ (alunos_curso / total_alunos) * fator_curso
    ROUND(COALESCE(
        (
            SELECT SUM(
                (apc.quantidade_alunos::DECIMAL / NULLIF(tp.total_alunos, 0)) * apc.fator_demanda_curso
            )
            FROM alunos_por_curso apc
            WHERE apc.professor_id = p.id
        ),
        1.0
    ), 2) AS fator_demanda_ponderado,
    -- Detalhamento por curso (JSON array)
    COALESCE(
        (
            SELECT json_agg(json_build_object(
                'curso_id', apc.curso_id,
                'curso_nome', apc.curso_nome,
                'quantidade', apc.quantidade_alunos,
                'percentual', ROUND((apc.quantidade_alunos::DECIMAL / NULLIF(tp.total_alunos, 0)) * 100, 1),
                'fator_curso', apc.fator_demanda_curso,
                'contribuicao', ROUND((apc.quantidade_alunos::DECIMAL / NULLIF(tp.total_alunos, 0)) * apc.fator_demanda_curso, 2)
            ) ORDER BY apc.quantidade_alunos DESC)
            FROM alunos_por_curso apc
            WHERE apc.professor_id = p.id
        ),
        '[]'::json
    ) AS detalhamento_cursos
FROM professores p
LEFT JOIN totais_professor tp ON tp.professor_id = p.id
WHERE p.ativo = true;

COMMENT ON VIEW vw_fator_demanda_professor IS 'Calcula o Fator de Demanda Ponderado de cada professor baseado na composição da carteira de alunos';
