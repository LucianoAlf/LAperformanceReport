-- Fase 1: registrar_experimental passa a gravar curso (resolvido do nome) + emusys_aula_id.
-- Unifica as 2 overloads (9 e 10 args) numa só (12 params com defaults), evitando ambiguidade.
-- Chamadas existentes (cancelamento 9 args, agendamento 10 args) continuam casando.

DROP FUNCTION IF EXISTS public.registrar_experimental(text,text,uuid,text,integer,date,time without time zone,integer,integer);
DROP FUNCTION IF EXISTS public.registrar_experimental(text,text,uuid,text,integer,date,time without time zone,integer,integer,timestamptz);

CREATE OR REPLACE FUNCTION public.registrar_experimental(
  p_telefone text,
  p_nome_aluno text,
  p_unidade_id uuid,
  p_status text DEFAULT 'experimental_agendada',
  p_etapa integer DEFAULT 5,
  p_data_experimental date DEFAULT NULL,
  p_horario_experimental time without time zone DEFAULT NULL,
  p_professor_id integer DEFAULT NULL,
  p_emusys_lead_id integer DEFAULT NULL,
  p_created_at timestamptz DEFAULT now(),
  p_curso text DEFAULT NULL,
  p_emusys_aula_id integer DEFAULT NULL
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
  v_curso_id INTEGER;
  v_curso_norm TEXT;
BEGIN
  v_tel_norm := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');
  v_nome_aluno_safe := COALESCE(NULLIF(TRIM(p_nome_aluno), ''), '(sem nome)');

  -- 1. Buscar lead: primeiro por emusys_lead_id, depois por telefone, depois por nome
  IF p_emusys_lead_id IS NOT NULL THEN
    SELECT id INTO v_lead_id FROM leads WHERE emusys_lead_id = p_emusys_lead_id LIMIT 1;
  END IF;
  IF v_lead_id IS NULL AND length(v_tel_norm) >= 10 THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE telefone = v_tel_norm AND unidade_id = p_unidade_id AND NOT arquivado LIMIT 1;
  END IF;
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
    UPDATE lead_experimentais SET status = 'cancelada', updated_at = NOW()
    WHERE lead_id = v_lead_id AND nome_aluno = v_nome_aluno_safe AND status = 'experimental_agendada';

    UPDATE leads SET
      experimental_agendada = false, data_experimental = NULL, horario_experimental = NULL,
      professor_experimental_id = NULL, status = 'novo', etapa_pipeline_id = 1, updated_at = NOW()
    WHERE id = v_lead_id AND status NOT IN ('convertido', 'arquivado')
      AND NOT EXISTS (SELECT 1 FROM lead_experimentais WHERE lead_id = v_lead_id AND status = 'experimental_agendada');

    RETURN json_build_object('success', true, 'action', 'cancelada', 'lead_id', v_lead_id);
  END IF;

  -- 2b. Resolver curso (nome -> curso_id) com a MESMA normalização da edge sync-presenca
  --     (lower+unaccent, remove " para instrumento", remove sufixo " t"/" ind", colapsa espaços)
  IF p_curso IS NOT NULL AND TRIM(p_curso) <> '' THEN
    v_curso_norm := trim(regexp_replace(
      regexp_replace(
        regexp_replace(lower(unaccent(p_curso)), '\s+para\s+instrumento$', '', 'g'),
        '\s+(t|ind)$', '', 'g'),
      '\s+', ' ', 'g'));
    SELECT id INTO v_curso_id FROM cursos
    WHERE trim(regexp_replace(
        regexp_replace(
          regexp_replace(lower(unaccent(nome)), '\s+para\s+instrumento$', '', 'g'),
          '\s+(t|ind)$', '', 'g'),
        '\s+', ' ', 'g')) = v_curso_norm
    ORDER BY (nome ILIKE '% IND') ASC, id
    LIMIT 1;
  END IF;

  -- 3. UPSERT: por emusys_aula_id quando houver (permite multi-instrumento); senão, fallback legado
  IF p_emusys_aula_id IS NOT NULL THEN
    INSERT INTO lead_experimentais (
      lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
      professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id,
      emusys_lead_id, emusys_aula_id, created_at
    ) VALUES (
      v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
      p_professor_id, v_curso_id, p_status, p_etapa, p_emusys_lead_id, p_emusys_aula_id, p_created_at
    )
    ON CONFLICT (emusys_aula_id) WHERE emusys_aula_id IS NOT NULL
    DO UPDATE SET
      nome_aluno = EXCLUDED.nome_aluno,
      lead_id = COALESCE(EXCLUDED.lead_id, lead_experimentais.lead_id),
      data_experimental = COALESCE(EXCLUDED.data_experimental, lead_experimentais.data_experimental),
      horario_experimental = COALESCE(EXCLUDED.horario_experimental, lead_experimentais.horario_experimental),
      professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, lead_experimentais.curso_interesse_id),
      status = EXCLUDED.status,
      etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
      emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
      updated_at = NOW()
    RETURNING id INTO v_exp_id;
  ELSE
    INSERT INTO lead_experimentais (
      lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
      professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id,
      emusys_lead_id, created_at
    ) VALUES (
      v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
      p_professor_id, v_curso_id, p_status, p_etapa, p_emusys_lead_id, p_created_at
    )
    ON CONFLICT (lead_id, data_experimental, nome_aluno) WHERE status::text <> 'cancelada' AND emusys_aula_id IS NULL
    DO UPDATE SET
      horario_experimental = COALESCE(EXCLUDED.horario_experimental, lead_experimentais.horario_experimental),
      professor_experimental_id = COALESCE(EXCLUDED.professor_experimental_id, lead_experimentais.professor_experimental_id),
      curso_interesse_id = COALESCE(EXCLUDED.curso_interesse_id, lead_experimentais.curso_interesse_id),
      status = EXCLUDED.status,
      etapa_pipeline_id = EXCLUDED.etapa_pipeline_id,
      emusys_lead_id = COALESCE(EXCLUDED.emusys_lead_id, lead_experimentais.emusys_lead_id),
      updated_at = NOW()
    RETURNING id INTO v_exp_id;
  END IF;

  -- 4. Atualizar colunas legadas do lead (guard: não sobrescreve convertido/arquivado)
  UPDATE leads SET
    experimental_agendada = true,
    data_experimental = COALESCE(p_data_experimental, data_experimental),
    horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
    professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id),
    status = p_status, etapa_pipeline_id = p_etapa, updated_at = NOW()
  WHERE id = v_lead_id AND status NOT IN ('convertido', 'arquivado');

  RETURN json_build_object('success', true, 'action', 'registered', 'lead_id', v_lead_id, 'experimental_id', v_exp_id, 'curso_id', v_curso_id);
END;
$function$;
