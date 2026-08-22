-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace view public.vw_fabio_carteira_professor as
 SELECT j.unidade_id,
    u.codigo AS unidade_codigo,
    u.nome AS unidade_nome,
    p.id AS professor_id,
    p.nome AS professor_nome,
    pu.id AS professores_unidade_id,
    pu.emusys_id AS emusys_professor_id,
    pu.validacao_status AS professor_emusys_validacao_status,
    a.id AS aluno_id,
    a.nome AS aluno_nome,
    COALESCE(a.emusys_student_id, j.emusys_aluno_id::text) AS emusys_student_id,
    COALESCE(a.emusys_matricula_id, j.emusys_matricula_id::text) AS emusys_matricula_id,
    j.status_matricula::character varying(20) AS aluno_status,
    COALESCE(c.id, j.curso_id) AS curso_id,
    COALESCE(c.nome, j.curso_nome_emusys::character varying)::character varying(100) AS curso_nome,
    tm.codigo AS tipo_matricula_codigo,
    tm.nome AS tipo_matricula_nome,
    COALESCE(a.dia_aula, j.dia_semana::character varying)::character varying(20) AS dia_aula,
    COALESCE(a.horario_aula, NULLIF(j.horario, ''::text)::time without time zone) AS horario_aula,
    a.telefone,
    a.whatsapp,
    a.email,
    a.responsavel_nome,
    a.responsavel_telefone,
    a.valor_parcela,
        CASE
            WHEN p.id IS NULL THEN 'sem_professor_la'::text
            WHEN pu.emusys_id IS NULL THEN 'professor_sem_emusys_id'::text
            WHEN a.emusys_student_id IS NULL AND j.emusys_aluno_id IS NULL THEN 'aluno_sem_id_emusys'::text
            WHEN COALESCE(a.dia_aula, j.dia_semana::character varying) IS NULL OR COALESCE(a.horario_aula, NULLIF(j.horario, ''::text)::time without time zone) IS NULL THEN 'sem_horario'::text
            ELSE 'ok'::text
        END AS qualidade_contexto,
    j.id AS jornada_id,
    j.emusys_matricula_disciplina_id,
    a.data_matricula,
    CASE WHEN a.data_matricula IS NULL THEN NULL
         ELSE (CURRENT_DATE - a.data_matricula) END AS dias_desde_matricula,
    COALESCE(a.data_matricula >= CURRENT_DATE - 30, false) AS e_aluno_novo,
    COALESCE(reg.total, 0)::integer AS aulas_registradas
   FROM aluno_jornada_matricula_disciplina j
     JOIN alunos a ON a.id = j.aluno_id
     JOIN unidades u ON u.id = j.unidade_id
     JOIN professores p ON p.id = j.professor_id AND p.ativo = true
     JOIN professores_unidades pu ON pu.professor_id = p.id AND pu.unidade_id = j.unidade_id AND pu.emusys_ativo = true AND pu.validacao_status <> 'ignorado'::text
     LEFT JOIN cursos c ON c.id = COALESCE(j.curso_id, a.curso_id)
     LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
     LEFT JOIN (
       SELECT r.aluno_id, count(*) AS total
         FROM fabio_registros_aula r
        WHERE r.aluno_id IS NOT NULL
          AND r.status IN ('confirmado', 'gravado_emusys')
        GROUP BY r.aluno_id
     ) reg ON reg.aluno_id = a.id
  WHERE j.status_matricula = 'ativa'::text AND a.arquivado_em IS NULL;

comment on view public.vw_fabio_carteira_professor is
'Carteira do professor que o Fabio le. Desde a 026 diz tambem HA QUANTO TEMPO o aluno esta na casa (data_matricula, dias_desde_matricula, e_aluno_novo) e quantas aulas dele ja foram registradas.';
