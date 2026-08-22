-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION public.buscar_anamneses_pendentes(p_aluno_id integer)
RETURNS TABLE (
  anamnese_id integer,
  nome_aluno text,
  tipo_formulario text,
  unidade_id uuid,
  unidade_nome text,
  temperamento_codinome text,
  created_at timestamptz,
  match_score integer,
  match_label text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome  text;
  v_unid  uuid;
  v_class text;
  v_first text;
BEGIN
  SELECT lower(trim(al.nome)), al.unidade_id, al.classificacao
    INTO v_nome, v_unid, v_class
    FROM alunos al WHERE al.id = p_aluno_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  v_first := split_part(v_nome, ' ', 1);

  RETURN QUERY
  SELECT
    a.id,
    a.nome_aluno::text,
    a.tipo_formulario::text,
    a.unidade_id,
    u.nome::text,
    a.temperamento_codinome::text,
    a.created_at,
    (
      (CASE WHEN lower(trim(a.nome_aluno)) = v_nome THEN 60 ELSE 0 END) +
      (CASE WHEN lower(trim(a.nome_aluno)) <> v_nome
             AND (lower(a.nome_aluno) LIKE '%' || v_first || '%'
                  OR v_nome LIKE '%' || lower(split_part(trim(a.nome_aluno), ' ', 1)) || '%')
            THEN 30 ELSE 0 END) +
      (CASE WHEN a.unidade_id = v_unid THEN 25 ELSE 0 END) +
      (CASE WHEN a.tipo_formulario = v_class THEN 15 ELSE 0 END)
    )::integer,
    (CASE
       WHEN lower(trim(a.nome_aluno)) = v_nome AND a.unidade_id = v_unid THEN 'Nome e unidade conferem'
       WHEN lower(trim(a.nome_aluno)) = v_nome THEN 'Mesmo nome (outra unidade)'
       ELSE 'Nome parecido'
     END)::text
  FROM anamneses a
  LEFT JOIN unidades u ON u.id = a.unidade_id
  WHERE a.aluno_id IS NULL
    AND a.vinculo_status = 'pendente'
    AND a.status = 'completa'
    AND (
      lower(trim(a.nome_aluno)) = v_nome
      OR lower(a.nome_aluno) LIKE '%' || v_first || '%'
      OR v_nome LIKE '%' || lower(split_part(trim(a.nome_aluno), ' ', 1)) || '%'
    )
  ORDER BY match_score DESC, a.created_at DESC
  LIMIT 20;
END;
$$;
