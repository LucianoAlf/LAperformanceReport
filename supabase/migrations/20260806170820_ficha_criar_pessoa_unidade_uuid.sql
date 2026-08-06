-- Histórico já aplicado em produção em 2026-08-06.
-- A coluna colaboradores.unidade_id é UUID; a versão anterior declarava integer.
DROP FUNCTION IF EXISTS public.ficha_criar_pessoa(text, integer, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.ficha_criar_pessoa(text, uuid, text, text, text, text, text, text);

CREATE FUNCTION public.ficha_criar_pessoa(
  p_nome text,
  p_unidade_id uuid,
  p_whatsapp text DEFAULT NULL,
  p_departamento text DEFAULT 'Atendimento',
  p_cargo_contexto text DEFAULT 'ATENDIMENTO',
  p_situacao text DEFAULT 'candidato',
  p_origem_sistema text DEFAULT NULL,
  p_origem_ref text DEFAULT NULL
)
RETURNS TABLE(colaborador_id integer, token text, ja_existia boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id integer;
  v_token text;
  v_slug text;
BEGIN
  IF p_origem_ref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(p_origem_sistema, '') || ':' || p_origem_ref, 0));

    SELECT c.id INTO v_id
    FROM public.colaboradores c
    WHERE c.origem_sistema IS NOT DISTINCT FROM p_origem_sistema
      AND c.origem_ref = p_origem_ref
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      SELECT t.token INTO v_token
      FROM public.ficha_tokens t
      WHERE t.colaborador_id = v_id AND t.ativo
      ORDER BY t.criado_em
      LIMIT 1;
      IF v_token IS NOT NULL THEN
        RETURN QUERY SELECT v_id, v_token, true;
        RETURN;
      END IF;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.colaboradores (
      nome, apelido, tipo, departamento, unidade_id, whatsapp, situacao, ativo, origem_sistema, origem_ref
    ) VALUES (
      btrim(p_nome), split_part(btrim(p_nome), ' ', 1), 'farmer', p_departamento, p_unidade_id,
      nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''), p_situacao, true,
      p_origem_sistema, p_origem_ref
    )
    ON CONFLICT (origem_sistema, origem_ref) WHERE origem_ref IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_id;

    IF v_id IS NULL AND p_origem_ref IS NOT NULL THEN
      SELECT c.id INTO v_id
      FROM public.colaboradores c
      WHERE c.origem_sistema IS NOT DISTINCT FROM p_origem_sistema
        AND c.origem_ref = p_origem_ref
      LIMIT 1;
      SELECT t.token INTO v_token
      FROM public.ficha_tokens t
      WHERE t.colaborador_id = v_id AND t.ativo
      ORDER BY t.criado_em
      LIMIT 1;
      IF v_token IS NOT NULL THEN
        RETURN QUERY SELECT v_id, v_token, true;
        RETURN;
      END IF;
    END IF;
  END IF;

  v_slug := nullif(regexp_replace(public.unaccent_imutavel(split_part(btrim(p_nome), ' ', 1)), '[^a-z]', '', 'g'), '');
  v_token := coalesce(v_slug, 'ficha') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  INSERT INTO public.ficha_tokens (token, colaborador_id, cargo_contexto, ativo)
  VALUES (v_token, v_id, p_cargo_contexto, true);

  RETURN QUERY SELECT v_id, v_token, false;
END;
$$;
