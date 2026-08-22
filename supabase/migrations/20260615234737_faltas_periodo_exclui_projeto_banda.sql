-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION public.get_faltas_periodo(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
RETURNS TABLE (
  aluno_id integer,
  nome text,
  unidade_id uuid,
  unidade_codigo text,
  curso_nome text,
  professor_nome text,
  telefone text,
  whatsapp text,
  responsavel_telefone text,
  total_aulas bigint,
  faltas bigint,
  presencas bigint,
  pct_presenca numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dedup AS (
    -- Colapsa a duplicata da API Emusys (mesma aula vem como individual + turma).
    -- DISTINCT ON pega 1 linha por (aluno, dia, curso); a ordem prioriza a visao
    -- 'individual' (ficha real do aluno) e cai para 'turma' quando nao ha individual.
    SELECT DISTINCT ON (p.aluno_id, p.data_aula, ae.curso_nome)
      p.aluno_id, p.data_aula, p.status
    FROM aluno_presenca p
    JOIN aulas_emusys ae ON ae.id = p.aula_emusys_id
    WHERE p.data_aula BETWEEN p_data_inicio AND p_data_fim
      AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id)
      AND ae.categoria = 'normal'
      AND p.status IN ('presente','ausente')
    ORDER BY p.aluno_id, p.data_aula, ae.curso_nome,
      CASE ae.tipo WHEN 'individual' THEN 0 WHEN 'turma' THEN 1 ELSE 2 END
  ),
  agg AS (
    SELECT aluno_id,
      count(*) AS total_aulas,
      count(*) FILTER (WHERE status='ausente') AS faltas,
      count(*) FILTER (WHERE status='presente') AS presencas
    FROM dedup
    GROUP BY aluno_id
  )
  SELECT
    a.id,
    a.nome::text,
    a.unidade_id,
    u.codigo::text,
    c.nome::text,
    pr.nome::text,
    a.telefone::text,
    a.whatsapp::text,
    a.responsavel_telefone::text,
    g.total_aulas,
    g.faltas,
    g.presencas,
    CASE WHEN g.total_aulas > 0 THEN round(100.0 * g.presencas / g.total_aulas, 0) ELSE 0 END
  FROM agg g
  JOIN alunos a ON a.id = g.aluno_id
  LEFT JOIN unidades u ON u.id = a.unidade_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  LEFT JOIN professores pr ON pr.id = a.professor_atual_id
  WHERE g.faltas >= 1
    AND a.status IN ('ativo','aviso_previo')
    AND COALESCE(c.is_projeto_banda, false) = false  -- exclui projeto banda (coerente com medias/score)
  ORDER BY g.faltas DESC, a.nome;
$$;
