-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Overload 1 (9 params) — sem p_created_at
CREATE OR REPLACE FUNCTION public.registrar_experimental(
  p_telefone text,
  p_nome_aluno text,
  p_unidade_id uuid,
  p_status text DEFAULT 'experimental_agendada'::text,
  p_etapa integer DEFAULT 5,
  p_data_experimental date DEFAULT NULL::date,
  p_horario_experimental time without time zone DEFAULT NULL::time without time zone,
  p_professor_id integer DEFAULT NULL::integer,
  p_emusys_lead_id integer DEFAULT NULL::integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_lead_id INTEGER;
  v_tel_norm TEXT;
  v_exp_id INTEGER;
  v_nome_aluno_safe TEXT;
BEGIN
  v_tel_norm := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_nome_aluno_safe := COALESCE(NULLIF(TRIM(p_nome_aluno), ''), '(sem nome)');

  -- 1. Buscar lead: primeiro por emusys_lead_id, depois por telefone
  IF p_emusys_lead_id IS NOT NULL THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE emusys_lead_id = p_emusys_lead_id
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND length(v_tel_norm) >= 10 THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE telefone = v_tel_norm AND unidade_id = p_unidade_id AND NOT arquivado
    LIMIT 1;
  END IF;

  -- Fallback por nome
  IF v_lead_id IS NULL AND p_nome_aluno IS NOT NULL AND TRIM(p_nome_aluno) != '' THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE lower(trim(nome)) = lower(trim(p_nome_aluno)) AND unidade_id = p_unidade_id AND NOT arquivado
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'lead_not_found');
  END IF;

  -- 2. Cancelamento
  IF p_status IN ('cancelada', 'novo') THEN
    UPDATE lead_experimentais SET
      status = 'cancelada',
      updated_at = NOW()
    WHERE lead_id = v_lead_id
      AND nome_aluno = v_nome_aluno_safe
      AND status = 'experimental_agendada';

    UPDATE leads SET
      experimental_agendada = false,
      data_experimental = NULL,
      horario_experimental = NULL,
      professor_experimental_id = NULL,
      status = 'novo',
      etapa_pipeline_id = 1,
      updated_at = NOW()
    WHERE id = v_lead_id
      AND status NOT IN ('convertido', 'arquivado')
      AND NOT EXISTS (
        SELECT 1 FROM lead_experimentais
        WHERE lead_id = v_lead_id AND status = 'experimental_agendada'
      );

    RETURN json_build_object('success', true, 'action', 'cancelada', 'lead_id', v_lead_id);
  END IF;

  -- 3. UPSERT na lead_experimentais
  INSERT INTO lead_experimentais (
    lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
    professor_experimental_id, status, etapa_pipeline_id, emusys_lead_id
  ) VALUES (
    v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
    p_professor_id, p_status, p_etapa, p_emusys_lead_id
  )
  ON CONFLICT (lead_id, data_experimental, nome_aluno) WHERE status != 'cancelada'
  DO UPDATE SET
    horario_experimental = COALESCE(EXCLUDED.horario_experimental, lead_experimentais.horario_experimental),
    professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
    status = EXCLUDED.status,
    etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
    emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
    updated_at = NOW()
  RETURNING id INTO v_exp_id;

  -- 4. Atualizar colunas legadas do lead
  -- Guard: não sobrescreve status se lead já convertido ou arquivado
  UPDATE leads SET
    experimental_agendada = true,
    data_experimental = COALESCE(p_data_experimental, data_experimental),
    horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
    professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id),
    status = p_status,
    etapa_pipeline_id = p_etapa,
    updated_at = NOW()
  WHERE id = v_lead_id
    AND status NOT IN ('convertido', 'arquivado');

  RETURN json_build_object('success', true, 'action', 'registered', 'lead_id', v_lead_id, 'experimental_id', v_exp_id);
END;
$function$;

-- Overload 2 (10 params) — com p_created_at
CREATE OR REPLACE FUNCTION public.registrar_experimental(
  p_telefone text,
  p_nome_aluno text,
  p_unidade_id uuid,
  p_status text DEFAULT 'experimental_agendada'::text,
  p_etapa integer DEFAULT 5,
  p_data_experimental date DEFAULT NULL::date,
  p_horario_experimental time without time zone DEFAULT NULL::time without time zone,
  p_professor_id integer DEFAULT NULL::integer,
  p_emusys_lead_id integer DEFAULT NULL::integer,
  p_created_at timestamp with time zone DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_lead_id INTEGER;
  v_tel_norm TEXT;
  v_exp_id INTEGER;
  v_nome_aluno_safe TEXT;
BEGIN
  v_tel_norm := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_nome_aluno_safe := COALESCE(NULLIF(TRIM(p_nome_aluno), ''), '(sem nome)');

  -- 1. Buscar lead: primeiro por emusys_lead_id, depois por telefone
  IF p_emusys_lead_id IS NOT NULL THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE emusys_lead_id = p_emusys_lead_id
    LIMIT 1;
  END IF;

  IF v_lead_id IS NULL AND length(v_tel_norm) >= 10 THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE telefone = v_tel_norm AND unidade_id = p_unidade_id AND NOT arquivado
    LIMIT 1;
  END IF;

  -- Fallback por nome
  IF v_lead_id IS NULL AND p_nome_aluno IS NOT NULL AND TRIM(p_nome_aluno) != '' THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE lower(trim(nome)) = lower(trim(p_nome_aluno)) AND unidade_id = p_unidade_id AND NOT arquivado
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'lead_not_found');
  END IF;

  -- 2. Cancelamento
  IF p_status IN ('cancelada', 'novo') THEN
    UPDATE lead_experimentais SET
      status = 'cancelada',
      updated_at = NOW()
    WHERE lead_id = v_lead_id
      AND nome_aluno = v_nome_aluno_safe
      AND status = 'experimental_agendada';

    UPDATE leads SET
      experimental_agendada = false,
      data_experimental = NULL,
      horario_experimental = NULL,
      professor_experimental_id = NULL,
      status = 'novo',
      etapa_pipeline_id = 1,
      updated_at = NOW()
    WHERE id = v_lead_id
      AND status NOT IN ('convertido', 'arquivado')
      AND NOT EXISTS (
        SELECT 1 FROM lead_experimentais
        WHERE lead_id = v_lead_id AND status = 'experimental_agendada'
      );

    RETURN json_build_object('success', true, 'action', 'cancelada', 'lead_id', v_lead_id);
  END IF;

  -- 3. UPSERT na lead_experimentais (usando p_created_at)
  INSERT INTO lead_experimentais (
    lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
    professor_experimental_id, status, etapa_pipeline_id, emusys_lead_id, created_at
  ) VALUES (
    v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
    p_professor_id, p_status, p_etapa, p_emusys_lead_id, p_created_at
  )
  ON CONFLICT (lead_id, data_experimental, nome_aluno) WHERE status != 'cancelada'
  DO UPDATE SET
    horario_experimental = COALESCE(EXCLUDED.horario_experimental, lead_experimentais.horario_experimental),
    professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
    status = EXCLUDED.status,
    etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
    emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
    updated_at = NOW()
  RETURNING id INTO v_exp_id;

  -- 4. Atualizar colunas legadas do lead
  -- Guard: não sobrescreve status se lead já convertido ou arquivado
  UPDATE leads SET
    experimental_agendada = true,
    data_experimental = COALESCE(p_data_experimental, data_experimental),
    horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
    professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id),
    status = p_status,
    etapa_pipeline_id = p_etapa,
    updated_at = NOW()
  WHERE id = v_lead_id
    AND status NOT IN ('convertido', 'arquivado');

  RETURN json_build_object('success', true, 'action', 'registered', 'lead_id', v_lead_id, 'experimental_id', v_exp_id);
END;
$function$;
