-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION public.vincular_alunos_checklist(
  p_checklist_id uuid,
  p_farmer_id integer,
  p_tipo_vinculo text DEFAULT 'todos_alunos',
  p_filtro_ids integer[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_unidade_id uuid;
  v_total integer := 0;
BEGIN
  -- Buscar unidade do checklist
  SELECT unidade_id INTO v_unidade_id
  FROM farmer_checklists
  WHERE id = p_checklist_id;

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Checklist não encontrado';
  END IF;

  -- Remover contatos existentes (para re-vincular limpo)
  DELETE FROM farmer_checklist_contatos WHERE checklist_id = p_checklist_id;

  -- Inserir contatos conforme tipo de vínculo
  IF p_tipo_vinculo = 'todos_alunos' THEN
    INSERT INTO farmer_checklist_contatos (checklist_id, aluno_id, farmer_id)
    SELECT p_checklist_id, a.id, p_farmer_id
    FROM alunos a
    WHERE a.unidade_id = v_unidade_id
      AND a.status = 'ativo';

  ELSIF p_tipo_vinculo = 'por_curso' AND p_filtro_ids IS NOT NULL THEN
    INSERT INTO farmer_checklist_contatos (checklist_id, aluno_id, farmer_id)
    SELECT p_checklist_id, a.id, p_farmer_id
    FROM alunos a
    WHERE a.unidade_id = v_unidade_id
      AND a.status = 'ativo'
      AND a.curso_id = ANY(p_filtro_ids);

  ELSIF p_tipo_vinculo = 'por_professor' AND p_filtro_ids IS NOT NULL THEN
    INSERT INTO farmer_checklist_contatos (checklist_id, aluno_id, farmer_id)
    SELECT p_checklist_id, a.id, p_farmer_id
    FROM alunos a
    WHERE a.unidade_id = v_unidade_id
      AND a.status = 'ativo'
      AND a.professor_atual_id = ANY(p_filtro_ids);

  ELSIF p_tipo_vinculo = 'manual' AND p_filtro_ids IS NOT NULL THEN
    INSERT INTO farmer_checklist_contatos (checklist_id, aluno_id, farmer_id)
    SELECT p_checklist_id, unnest(p_filtro_ids), p_farmer_id;
  END IF;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$;
