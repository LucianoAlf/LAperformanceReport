-- P12: decisao auditada para alunos que nao possuem Instagram.
-- Mantem a fonte canonica em public.alunos e evita pendencias recorrentes
-- quando o Emusys informa "nao possui" em campo livre.

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS instagram_nao_possui boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_nao_possui_marcado_em timestamptz,
  ADD COLUMN IF NOT EXISTS instagram_nao_possui_marcado_por text;

COMMENT ON COLUMN public.alunos.instagram_nao_possui
  IS 'Decisao humana: aluno nao possui Instagram. Remove a obrigatoriedade de preencher instagram na conciliacao.';

CREATE OR REPLACE FUNCTION public.texto_indica_sem_instagram(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH norm AS (
    SELECT regexp_replace(
      translate(
        lower(coalesce(p_text, '')),
        chr(225) || chr(224) || chr(227) || chr(226) || chr(228) ||
        chr(233) || chr(232) || chr(234) || chr(235) ||
        chr(237) || chr(236) || chr(238) || chr(239) ||
        chr(243) || chr(242) || chr(245) || chr(244) || chr(246) ||
        chr(250) || chr(249) || chr(251) || chr(252) || chr(231),
        'aaaaaeeeeiiiiooooouuuuc'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS texto
  ),
  trimmed AS (
    SELECT btrim(texto) AS texto FROM norm
  )
  SELECT texto IN (
      'nao possui',
      'nao possui instagram',
      'nao possui insta',
      'nao tem',
      'nao tem instagram',
      'nao tem insta',
      'n possui',
      'n possui instagram',
      'n tem',
      'n tem instagram',
      'sem instagram',
      'sem insta',
      'nao usa',
      'nao usa instagram',
      'nao utiliza',
      'nao utiliza instagram'
    )
    OR texto LIKE 'nao possui %'
    OR texto LIKE 'nao tem %'
    OR texto LIKE 'n possui %'
    OR texto LIKE 'n tem %'
    OR texto LIKE 'sem instagram%'
    OR texto LIKE 'sem insta%'
    OR texto LIKE 'nao usa %'
    OR texto LIKE 'nao utiliza %'
  FROM trimmed;
$$;

ALTER TABLE public.alunos_emusys_atributos_decisoes
  DROP CONSTRAINT IF EXISTS alunos_emusys_atributos_decisoes_decisao_check;

ALTER TABLE public.alunos_emusys_atributos_decisoes
  ADD CONSTRAINT alunos_emusys_atributos_decisoes_decisao_check
  CHECK (decisao IN ('aplicar_emusys', 'manter_la', 'ignorar', 'revisar', 'definir_manual', 'nao_possui_instagram'));

CREATE OR REPLACE FUNCTION public.marcar_aluno_sem_instagram_conciliacao(
  p_divergencia_id bigint,
  p_decidido_por text DEFAULT 'usuario_app'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_div public.alunos_emusys_atributos_divergencias%ROWTYPE;
  v_agora timestamptz := now();
  v_valor_aplicado jsonb;
BEGIN
  SELECT *
    INTO v_div
  FROM public.alunos_emusys_atributos_divergencias
  WHERE id = p_divergencia_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'divergencia % nao encontrada', p_divergencia_id;
  END IF;

  IF v_div.resolvido THEN
    RETURN jsonb_build_object('ok', true, 'ja_resolvido', true, 'id', p_divergencia_id);
  END IF;

  IF v_div.aluno_id IS NULL THEN
    RAISE EXCEPTION 'aluno_id obrigatorio para marcar sem Instagram';
  END IF;

  IF v_div.campo <> 'instagram' OR v_div.tipo_divergencia NOT IN ('instagram_ausente', 'instagram_divergente') THEN
    RAISE EXCEPTION 'divergencia % nao e de Instagram', p_divergencia_id;
  END IF;

  UPDATE public.alunos
  SET instagram = NULL,
      instagram_nao_possui = true,
      instagram_nao_possui_marcado_em = v_agora,
      instagram_nao_possui_marcado_por = COALESCE(NULLIF(trim(p_decidido_por), ''), 'usuario_app'),
      updated_at = v_agora
  WHERE id = v_div.aluno_id;

  v_valor_aplicado := jsonb_build_object(
    'instagram', NULL,
    'instagram_nao_possui', true
  );

  INSERT INTO public.alunos_emusys_atributos_decisoes
    (divergencia_id, aluno_id, decisao, campo, valor_nosso, valor_emusys, valor_aplicado, motivo, decidido_por, metadata)
  VALUES
    (
      v_div.id,
      v_div.aluno_id,
      'nao_possui_instagram',
      v_div.campo,
      COALESCE(v_div.valor_nosso, '{}'::jsonb),
      COALESCE(v_div.valor_emusys, '{}'::jsonb),
      v_valor_aplicado,
      'Conciliacao atributo aluno: nao possui Instagram',
      COALESCE(NULLIF(trim(p_decidido_por), ''), 'usuario_app'),
      jsonb_build_object(
        'tipo_divergencia', v_div.tipo_divergencia,
        'emusys_student_id', v_div.emusys_student_id,
        'emusys_matricula_id', v_div.emusys_matricula_id,
        'fonte', v_div.fonte
      )
    );

  UPDATE public.alunos_emusys_atributos_divergencias
  SET resolvido = true,
      decisao = 'nao_possui_instagram',
      decidido_por = COALESCE(NULLIF(trim(p_decidido_por), ''), 'usuario_app'),
      decidido_em = v_agora,
      updated_at = v_agora
  WHERE id = v_div.id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_div.id,
    'aluno_id', v_div.aluno_id,
    'decisao', 'nao_possui_instagram',
    'resolvido', true,
    'valor_aplicado', v_valor_aplicado
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.marcar_aluno_sem_instagram_conciliacao(bigint, text) TO authenticated;

COMMENT ON FUNCTION public.marcar_aluno_sem_instagram_conciliacao(bigint, text)
  IS 'Marca aluno como sem Instagram a partir da conciliacao de atributos, registrando decisao auditada.';

WITH candidatas AS (
  SELECT d.*
  FROM public.alunos_emusys_atributos_divergencias d
  WHERE d.resolvido IS FALSE
    AND d.campo = 'instagram'
    AND d.tipo_divergencia IN ('instagram_ausente', 'instagram_divergente')
    AND d.aluno_id IS NOT NULL
    AND (
      public.texto_indica_sem_instagram(d.valor_emusys->>'instagram')
      OR public.texto_indica_sem_instagram(d.sugestao->>'instagram')
      OR public.texto_indica_sem_instagram(d.valor_nosso->>'instagram')
    )
),
alunos_update AS (
  UPDATE public.alunos a
  SET instagram = NULL,
      instagram_nao_possui = true,
      instagram_nao_possui_marcado_em = now(),
      instagram_nao_possui_marcado_por = 'migration_p12',
      updated_at = now()
  FROM candidatas c
  WHERE a.id = c.aluno_id
  RETURNING a.id
),
auditoria AS (
  INSERT INTO public.alunos_emusys_atributos_decisoes
    (divergencia_id, aluno_id, decisao, campo, valor_nosso, valor_emusys, valor_aplicado, motivo, decidido_por, metadata)
  SELECT
    c.id,
    c.aluno_id,
    'nao_possui_instagram',
    c.campo,
    COALESCE(c.valor_nosso, '{}'::jsonb),
    COALESCE(c.valor_emusys, '{}'::jsonb),
    jsonb_build_object('instagram', NULL, 'instagram_nao_possui', true),
    'Conciliacao atributo aluno: texto Emusys indica que nao possui Instagram',
    'migration_p12',
    jsonb_build_object(
      'tipo_divergencia', c.tipo_divergencia,
      'emusys_student_id', c.emusys_student_id,
      'emusys_matricula_id', c.emusys_matricula_id,
      'fonte', c.fonte
    )
  FROM candidatas c
  RETURNING divergencia_id
)
UPDATE public.alunos_emusys_atributos_divergencias d
SET resolvido = true,
    decisao = 'nao_possui_instagram',
    decidido_por = 'migration_p12',
    decidido_em = now(),
    updated_at = now()
FROM auditoria a
WHERE d.id = a.divergencia_id;
