-- Reparo complementar: Erick Osmy e um vinculo operacional ativo no Recreio.
-- A migration anterior aceitava apenas identidades historicas inativas e, por isso,
-- preservou corretamente as aulas ate que o vinculo operacional fosse confirmado.

DO $$
DECLARE
  v_unidade_id uuid;
  v_vinculos integer;
  v_pendentes integer;
  v_vinculadas integer;
  v_atualizadas integer;
BEGIN
  SELECT id
    INTO v_unidade_id
  FROM public.unidades
  WHERE lower(nome) = 'recreio'
  LIMIT 1;

  IF v_unidade_id IS NULL THEN
    RAISE EXCEPTION 'Reparo Erick abortado: unidade Recreio nao encontrada';
  END IF;

  SELECT count(*)::integer
    INTO v_vinculos
  FROM public.professores_unidades pu
  WHERE pu.unidade_id = v_unidade_id
    AND pu.emusys_id = 2109
    AND pu.professor_id = 52
    AND pu.emusys_ativo = true
    AND pu.validacao_status IN ('validado_humano', 'auto_match', 'preexistente');

  IF v_vinculos <> 1 THEN
    RAISE EXCEPTION
      'Reparo Erick abortado: esperado 1 vinculo operacional 52/Recreio/2109, encontrado %',
      v_vinculos;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.professores_unidades pu
    WHERE pu.unidade_id = v_unidade_id
      AND pu.emusys_id = 2109
      AND pu.professor_id <> 52
  ) THEN
    RAISE EXCEPTION 'Reparo Erick abortado: emusys_id 2109 possui vinculo concorrente';
  END IF;

  SELECT
    count(*) FILTER (WHERE ae.professor_id IS NULL)::integer,
    count(*) FILTER (WHERE ae.professor_id = 52)::integer
  INTO v_pendentes, v_vinculadas
  FROM public.aulas_emusys ae
  WHERE ae.unidade_id = v_unidade_id
    AND ae.emusys_professor_id = 2109
    AND ae.data_aula BETWEEN date '2026-07-08' AND date '2026-07-11'
    AND COALESCE(ae.sem_acompanhamento, false) = false;

  IF NOT (
    (v_pendentes = 45 AND v_vinculadas = 0)
    OR (v_pendentes = 0 AND v_vinculadas = 45)
  ) THEN
    RAISE EXCEPTION
      'Reparo Erick abortado: esperado estado 45/0 ou 0/45, encontrado pendentes=% vinculadas=%',
      v_pendentes,
      v_vinculadas;
  END IF;

  IF v_pendentes = 45 THEN
    UPDATE public.aulas_emusys ae
       SET professor_id = 52
     WHERE ae.unidade_id = v_unidade_id
       AND ae.emusys_professor_id = 2109
       AND ae.data_aula BETWEEN date '2026-07-08' AND date '2026-07-11'
       AND ae.professor_id IS NULL
       AND COALESCE(ae.sem_acompanhamento, false) = false;

    GET DIAGNOSTICS v_atualizadas = ROW_COUNT;
    IF v_atualizadas <> 45 THEN
      RAISE EXCEPTION 'Reparo Erick abortado: 45 esperadas, % atualizadas', v_atualizadas;
    END IF;

    INSERT INTO public.professores_sync_log (
      evento,
      unidade_id,
      professor_id,
      emusys_id,
      nome_emusys,
      detalhes
    )
    SELECT
      'aulas_erick_osmy_reparadas_20260715',
      v_unidade_id,
      52,
      2109,
      'Erick Osmy',
      jsonb_build_object(
        'aulas_reparadas', v_atualizadas,
        'periodo', '2026-07-08/2026-07-11',
        'regra', 'vinculo_operacional_ativo_por_id_emusys',
        'presencas_alteradas', 0
      )
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.professores_sync_log l
      WHERE l.evento = 'aulas_erick_osmy_reparadas_20260715'
        AND l.unidade_id = v_unidade_id
        AND l.professor_id = 52
        AND l.emusys_id = 2109
    );
  END IF;
END;
$$;
