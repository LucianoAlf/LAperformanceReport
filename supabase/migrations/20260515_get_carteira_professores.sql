CREATE OR REPLACE FUNCTION public.get_carteira_professores(
  p_unidade_id uuid DEFAULT NULL
)
RETURNS TABLE(
  professor_id       integer,
  professor_nome     text,
  foto_url           text,
  total_alunos       integer,
  alunos_lamk        integer,
  alunos_emla        integer,
  mrr_total          numeric,
  ticket_medio       numeric,
  tempo_medio_meses  numeric,
  total_turmas       integer,
  media_alunos_turma numeric,
  cursos             text[],
  unidades           text[]
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH alunos_base AS (
    SELECT
      a.professor_atual_id,
      a.classificacao,
      a.valor_parcela,
      a.is_segundo_curso,
      a.tempo_permanencia_meses,
      a.curso_id,
      a.dia_aula,
      a.horario_aula,
      c.nome                                                    AS curso_nome,
      u.nome                                                    AS unidade_nome,
      (c.is_projeto_banda IS NULL OR c.is_projeto_banda = false) AS conta_turma
    FROM alunos a
    JOIN cursos   c ON a.curso_id   = c.id
    JOIN unidades u ON a.unidade_id = u.id
    WHERE a.status              = 'ativo'
      AND a.professor_atual_id IS NOT NULL
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  )
  SELECT
    p.id::integer,
    p.nome::text,
    p.foto_url::text,
    COUNT(*)::integer                                                          AS total_alunos,
    COUNT(*) FILTER (WHERE ab.classificacao = 'LAMK')::integer                AS alunos_lamk,
    COUNT(*) FILTER (WHERE ab.classificacao = 'EMLA')::integer                AS alunos_emla,
    COALESCE(SUM(CASE WHEN ab.valor_parcela > 0 THEN ab.valor_parcela ELSE 0 END), 0)::numeric(12,2) AS mrr_total,
    CASE
      WHEN COUNT(*) FILTER (WHERE ab.valor_parcela > 0 AND NOT ab.is_segundo_curso) > 0
        THEN ROUND(
          SUM(CASE WHEN ab.valor_parcela > 0 THEN ab.valor_parcela ELSE 0 END) /
          COUNT(*) FILTER (WHERE ab.valor_parcela > 0 AND NOT ab.is_segundo_curso), 2)
      ELSE 0
    END::numeric(10,2)                                                        AS ticket_medio,
    COALESCE(ROUND(AVG(ab.tempo_permanencia_meses), 1), 0)::numeric(5,1)     AS tempo_medio_meses,
    COUNT(DISTINCT CASE
      WHEN ab.conta_turma AND ab.dia_aula IS NOT NULL AND ab.horario_aula IS NOT NULL
        THEN (ab.curso_id::text || '@' || ab.dia_aula || ':' || ab.horario_aula)
      ELSE NULL
    END)::integer                                                             AS total_turmas,
    CASE
      WHEN COUNT(DISTINCT CASE
             WHEN ab.conta_turma AND ab.dia_aula IS NOT NULL AND ab.horario_aula IS NOT NULL
               THEN (ab.curso_id::text || '@' || ab.dia_aula || ':' || ab.horario_aula)
             ELSE NULL
           END) > 0
        THEN ROUND(
          COUNT(*) FILTER (WHERE ab.conta_turma)::numeric /
          COUNT(DISTINCT CASE
            WHEN ab.conta_turma AND ab.dia_aula IS NOT NULL AND ab.horario_aula IS NOT NULL
              THEN (ab.curso_id::text || '@' || ab.dia_aula || ':' || ab.horario_aula)
            ELSE NULL
          END), 2)
      ELSE 0
    END::numeric(5,2)                                                        AS media_alunos_turma,
    array_remove(array_agg(DISTINCT ab.curso_nome),    NULL)                 AS cursos,
    array_remove(array_agg(DISTINCT ab.unidade_nome),  NULL)                 AS unidades
  FROM professores p
  JOIN alunos_base ab ON ab.professor_atual_id = p.id
  WHERE p.ativo = true
  GROUP BY p.id, p.nome, p.foto_url
  ORDER BY p.nome;
END;
$$;
