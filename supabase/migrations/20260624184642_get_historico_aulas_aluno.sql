-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION public.get_historico_aulas_aluno(p_aluno_id integer)
RETURNS TABLE(
  data_aula date,
  status text,
  curso_nome text,
  turma_nome text,
  professor_nome text,
  nr_da_aula integer,
  cancelada boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    ae.data_aula,
    ap.status,
    ae.curso_nome,
    ae.turma_nome,
    ae.professor_nome,
    ae.nr_da_aula,
    ae.cancelada
  FROM aluno_presenca ap
  JOIN aulas_emusys ae ON ae.id = ap.aula_emusys_id
  WHERE ap.aluno_id = p_aluno_id
    AND ae.tipo = 'individual'
  ORDER BY ae.turma_nome, ae.data_aula DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_historico_aulas_aluno(integer) TO authenticated;
