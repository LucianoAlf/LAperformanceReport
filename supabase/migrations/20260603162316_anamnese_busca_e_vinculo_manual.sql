-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================================
-- Vínculo manual de anamnese pendente a um aluno já existente no LA Report
-- Cobre o ponto cego do trigger fn_vincular_anamnese_pendente, que só roda
-- no INSERT de aluno e exige match exato de nome+unidade+tipo.
-- =====================================================================

-- 1) BUSCA: dado um aluno, lista anamneses pendentes candidatas (ranqueadas).
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
  SELECT lower(trim(nome)), unidade_id, classificacao
    INTO v_nome, v_unid, v_class
    FROM alunos WHERE id = p_aluno_id;

  IF v_nome IS NULL THEN
    RETURN; -- aluno inexistente: retorna vazio
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
    )::integer AS match_score,
    (CASE
       WHEN lower(trim(a.nome_aluno)) = v_nome AND a.unidade_id = v_unid THEN 'Nome e unidade conferem'
       WHEN lower(trim(a.nome_aluno)) = v_nome THEN 'Mesmo nome (outra unidade)'
       ELSE 'Nome parecido'
     END)::text AS match_label
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

-- 2) VÍNCULO: liga uma anamnese pendente a um aluno e atualiza a ficha.
CREATE OR REPLACE FUNCTION public.vincular_anamnese_aluno(
  p_anamnese_id integer,
  p_aluno_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anam  anamneses%ROWTYPE;
  v_exist boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM alunos WHERE id = p_aluno_id) INTO v_exist;
  IF NOT v_exist THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'aluno_inexistente');
  END IF;

  SELECT * INTO v_anam FROM anamneses WHERE id = p_anamnese_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'anamnese_inexistente');
  END IF;

  -- Já vinculada a OUTRO aluno: bloqueia (evita roubar vínculo)
  IF v_anam.aluno_id IS NOT NULL AND v_anam.aluno_id <> p_aluno_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_vinculada_a_outro_aluno',
                              'aluno_id_atual', v_anam.aluno_id);
  END IF;

  UPDATE anamneses
     SET aluno_id = p_aluno_id,
         vinculo_status = 'vinculado'
   WHERE id = p_anamnese_id;

  UPDATE alunos
     SET anamnese_preenchida = true,
         anamnese_preenchida_em = COALESCE(anamnese_preenchida_em, NOW()),
         temperamento_codinome = v_anam.temperamento_codinome,
         updated_at = NOW()
   WHERE id = p_aluno_id;

  RETURN jsonb_build_object(
    'ok', true,
    'anamnese_id', p_anamnese_id,
    'aluno_id', p_aluno_id,
    'temperamento_codinome', v_anam.temperamento_codinome,
    'tipo_formulario', v_anam.tipo_formulario
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_anamneses_pendentes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_anamnese_aluno(integer, integer) TO authenticated;
