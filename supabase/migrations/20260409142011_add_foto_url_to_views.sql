-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE VIEW vw_aluno_sucesso_lista AS
SELECT a.id,
    a.nome,
    a.unidade_id,
    u.codigo AS unidade_codigo,
    u.nome AS unidade_nome,
    a.professor_atual_id,
    p.nome AS professor_nome,
    a.curso_id,
    c.nome AS curso_nome,
    a.tempo_permanencia_meses,
    a.status_pagamento,
    a.valor_parcela,
    a.percentual_presenca,
    a.data_matricula,
    a.dia_aula,
    a.horario_aula,
    a.modalidade,
    a.status,
    CASE
        WHEN a.tempo_permanencia_meses IS NULL THEN 'onboarding'
        WHEN a.tempo_permanencia_meses < 3 THEN 'onboarding'
        WHEN a.tempo_permanencia_meses < 6 THEN 'consolidacao'
        WHEN a.tempo_permanencia_meses < 9 THEN 'encantamento'
        ELSE 'renovacao'
    END AS fase_jornada,
    a.health_score_numerico,
    a.health_score AS health_status,
    a.health_score_updated_at,
    fb.feedback AS ultimo_feedback,
    fb.observacao AS ultimo_feedback_obs,
    fb.respondido_em AS ultimo_feedback_data,
    fb.professor_id AS ultimo_feedback_professor_id,
    COALESCE(ac.total_acoes, 0) AS total_acoes,
    COALESCE(mt.metas_ativas, 0) AS metas_ativas,
    a.responsavel_nome,
    a.responsavel_telefone,
    a.whatsapp,
    a.foto_url
FROM alunos a
    LEFT JOIN unidades u ON a.unidade_id = u.id
    LEFT JOIN professores p ON a.professor_atual_id = p.id
    LEFT JOIN cursos c ON a.curso_id = c.id
    LEFT JOIN LATERAL (
        SELECT aluno_feedback_professor.feedback,
            aluno_feedback_professor.observacao,
            aluno_feedback_professor.respondido_em,
            aluno_feedback_professor.professor_id
        FROM aluno_feedback_professor
        WHERE aluno_feedback_professor.aluno_id = a.id
        ORDER BY aluno_feedback_professor.competencia DESC, aluno_feedback_professor.respondido_em DESC
        LIMIT 1
    ) fb ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::integer AS total_acoes
        FROM aluno_acoes
        WHERE aluno_acoes.aluno_id = a.id
    ) ac ON true
    LEFT JOIN LATERAL (
        SELECT count(*)::integer AS metas_ativas
        FROM aluno_metas
        WHERE aluno_metas.aluno_id = a.id AND aluno_metas.status = 'ativa'
    ) mt ON true
WHERE a.status IN ('ativo', 'trancado')
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false);
