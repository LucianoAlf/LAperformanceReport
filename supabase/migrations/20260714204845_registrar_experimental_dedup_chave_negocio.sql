-- Dedup de aula experimental por CHAVE DE NEGOCIO (lead + data + horario + curso).
--
-- Motivo: o Emusys REENVIA o webhook `aula_experimental_criada` 2-4x por experimental
-- (rajada <1s). No payload, `body.id` e o id do EVENTO, NAO da aula (o id real da aula
-- nao vem no webhook). A coluna lead_experimentais.emusys_aula_id guardava esse id de
-- evento, entao o `ON CONFLICT (emusys_aula_id)` nunca colapsava -> 1 experimental virava
-- N linhas e inflava a contagem de "agendadas".
--
-- Fix: advisory lock na chave de negocio serializa os disparos concorrentes; depois
-- SELECT/UPDATE/INSERT por essa chave. Guard: nunca rebaixa realizada/faltou/matriculado
-- de volta para agendada (protege o que a sync de presenca ja marcou).
-- Forward-only: historico duplicado NAO e colapsado por esta migration.

CREATE OR REPLACE FUNCTION public.registrar_experimental(
  p_telefone text, p_nome_aluno text, p_unidade_id uuid,
  p_status text DEFAULT 'experimental_agendada', p_etapa integer DEFAULT 5,
  p_data_experimental date DEFAULT NULL, p_horario_experimental time without time zone DEFAULT NULL,
  p_professor_id integer DEFAULT NULL, p_emusys_lead_id integer DEFAULT NULL,
  p_created_at timestamptz DEFAULT now(), p_curso text DEFAULT NULL, p_emusys_aula_id integer DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $function$
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

  -- 1. Buscar lead: emusys_lead_id -> telefone -> nome
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

  -- 2b. Resolver curso (nome -> curso_id) com a MESMA normalizacao da edge sync-presenca
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

  -- 3. UPSERT por CHAVE DE NEGOCIO (lead + data + horario + curso).
  --    O Emusys REENVIA o webhook varias vezes; cada disparo traz um emusys_aula_id
  --    de EVENTO diferente (nao e o id da aula), entao dedup por emusys_aula_id nunca
  --    colapsa. Advisory lock serializa os disparos concorrentes da mesma experimental.
  PERFORM pg_advisory_xact_lock(hashtext(
    coalesce(v_lead_id::text,'') || '|' ||
    coalesce(p_data_experimental::text,'') || '|' ||
    coalesce(p_horario_experimental::text,'') || '|' ||
    coalesce(v_curso_id::text,'-1'))::bigint);

  SELECT id INTO v_exp_id
  FROM lead_experimentais
  WHERE lead_id = v_lead_id
    AND data_experimental IS NOT DISTINCT FROM p_data_experimental
    AND horario_experimental IS NOT DISTINCT FROM p_horario_experimental
    AND COALESCE(curso_interesse_id, -1) = COALESCE(v_curso_id, -1)
    AND status::text <> 'cancelada'
  ORDER BY id
  LIMIT 1;

  IF v_exp_id IS NOT NULL THEN
    -- ja existe linha viva pra esse slot: atualiza (nao cria duplicata)
    UPDATE lead_experimentais SET
      nome_aluno = v_nome_aluno_safe,
      horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
      professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id),
      curso_interesse_id = COALESCE(v_curso_id, curso_interesse_id),
      status = CASE
        WHEN status::text IN ('experimental_realizada','experimental_faltou','matriculado')
             AND p_status = 'experimental_agendada'
        THEN status ELSE p_status END,
      etapa_pipeline_id = p_etapa,
      emusys_lead_id = COALESCE(p_emusys_lead_id, emusys_lead_id),
      emusys_aula_id = COALESCE(emusys_aula_id, p_emusys_aula_id),
      updated_at = NOW()
    WHERE id = v_exp_id;
  ELSE
    INSERT INTO lead_experimentais (
      lead_id, nome_aluno, unidade_id, data_experimental, horario_experimental,
      professor_experimental_id, curso_interesse_id, status, etapa_pipeline_id,
      emusys_lead_id, emusys_aula_id, created_at
    ) VALUES (
      v_lead_id, v_nome_aluno_safe, p_unidade_id, p_data_experimental, p_horario_experimental,
      p_professor_id, v_curso_id, p_status, p_etapa, p_emusys_lead_id, p_emusys_aula_id, p_created_at
    ) RETURNING id INTO v_exp_id;
  END IF;

  -- 4. Atualizar colunas legadas do lead
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
