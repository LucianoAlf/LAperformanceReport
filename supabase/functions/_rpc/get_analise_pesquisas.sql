CREATE OR REPLACE FUNCTION public.get_analise_pesquisas(
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
  WITH base AS (
    SELECT
      pw.id,
      pw.aluno_id,
      pw.nota,
      pw.enviado_em,
      pw.respondido_em,
      a.curso_id,
      a.professor_atual_id,
      a.unidade_id
    FROM pesquisas_whatsapp pw
    JOIN alunos a ON a.id = pw.aluno_id
    WHERE pw.tipo = 'pos_primeira_aula'
      AND pw.enviado_ok = true
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      AND (p_data_inicio IS NULL OR pw.enviado_em >= p_data_inicio)
      AND (p_data_fim IS NULL OR pw.enviado_em < (p_data_fim + 1))
  ),
  respondidas AS (
    SELECT * FROM base WHERE nota IS NOT NULL
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'enviadas', (SELECT count(*) FROM base),
      'respondidas', (SELECT count(*) FROM respondidas),
      'taxa_resposta', CASE
        WHEN (SELECT count(*) FROM base) > 0
        THEN round((SELECT count(*) FROM respondidas)::numeric * 100 / (SELECT count(*) FROM base), 1)
        ELSE 0 END,
      'nota_media', COALESCE(round((SELECT avg(nota) FROM respondidas), 2), 0),
      'distribuicao', (
        SELECT jsonb_object_agg(n::text, qtd)
        FROM (
          SELECT n, COALESCE((SELECT count(*) FROM respondidas r WHERE r.nota = n), 0) AS qtd
          FROM generate_series(1, 5) n
        ) d
      )
    ),
    'por_professor', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT p.nome AS professor_nome, count(*) AS qtd, round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        JOIN professores p ON p.id = r.professor_atual_id
        GROUP BY p.nome
        ORDER BY avg(r.nota) DESC
      ) x
    ), '[]'::jsonb),
    'por_unidade', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT u.nome AS unidade_nome, count(*) AS qtd, round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        JOIN unidades u ON u.id = r.unidade_id
        GROUP BY u.nome
        ORDER BY u.nome
      ) x
    ), '[]'::jsonb),
    'por_curso', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT c.nome AS curso_nome, count(*) AS qtd, round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        JOIN cursos c ON c.id = r.curso_id
        GROUP BY c.nome
        ORDER BY avg(r.nota) DESC
      ) x
    ), '[]'::jsonb),
    'evolucao', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT
          to_char(date_trunc('week', r.respondido_em), 'YYYY-MM-DD') AS periodo,
          count(*) AS qtd,
          round(avg(r.nota), 2) AS nota_media
        FROM respondidas r
        GROUP BY date_trunc('week', r.respondido_em)
        ORDER BY date_trunc('week', r.respondido_em)
      ) x
    ), '[]'::jsonb)
  )
$function$;
