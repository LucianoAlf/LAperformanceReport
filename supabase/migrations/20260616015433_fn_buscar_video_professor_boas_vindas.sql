-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION buscar_video_professor(
  p_nome_professor text,
  p_nome_curso text,
  p_tipo text DEFAULT 'matricula'
) RETURNS text AS $$
  SELECT pv.url
  FROM professor_videos pv
  JOIN professores p ON p.id = pv.professor_id
  JOIN cursos c ON c.id = pv.curso_id
  WHERE lower(unaccent(p.nome)) LIKE lower(unaccent('%' || trim(p_nome_professor) || '%'))
    AND lower(unaccent(trim(p_nome_curso))) LIKE lower(unaccent(c.nome)) || '%'
    AND lower(trim(pv.tipo)) = lower(trim(p_tipo))
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
