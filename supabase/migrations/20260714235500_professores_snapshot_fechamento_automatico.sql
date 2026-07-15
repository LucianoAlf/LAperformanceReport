-- Fecha a carteira de professores logo apos o sync noturno do primeiro dia.
-- A captura usa a jornada por matricula/disciplina, mas conta cada aluno uma
-- unica vez por professor/unidade. Uma auditoria humana existente prevalece.

CREATE OR REPLACE FUNCTION public.capturar_carteira_professores_mensal(
  p_competencia date,
  p_fonte text DEFAULT 'sync_matriculas_emusys_fechamento_automatico'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_processados integer := 0;
BEGIN
  IF p_competencia IS NULL OR p_competencia <> v_competencia THEN
    RAISE EXCEPTION 'Competencia deve ser o primeiro dia do mes: %', p_competencia;
  END IF;

  IF v_competencia > date_trunc(
    'month',
    now() AT TIME ZONE 'America/Sao_Paulo'
  )::date THEN
    RAISE EXCEPTION 'Nao e permitido capturar competencia futura: %', v_competencia;
  END IF;

  WITH pares_validos AS (
    SELECT DISTINCT pu.unidade_id, pu.professor_id
    FROM public.professores_unidades pu
    JOIN public.professores p ON p.id = pu.professor_id
    WHERE p.ativo = true
      AND pu.emusys_ativo = true
      AND COALESCE(pu.validacao_status, '') <> 'ignorado'

    UNION

    SELECT DISTINCT j.unidade_id, j.professor_id
    FROM public.aluno_jornada_matricula_disciplina j
    JOIN public.professores p ON p.id = j.professor_id
    WHERE p.ativo = true
      AND j.status_matricula = 'ativa'
      AND j.professor_id IS NOT NULL
  ),
  contagens AS (
    SELECT
      j.unidade_id,
      j.professor_id,
      COUNT(DISTINCT COALESCE(
        j.emusys_aluno_id::text,
        CASE WHEN j.aluno_id IS NOT NULL THEN 'local:' || j.aluno_id::text END
      ))::integer AS carteira_alunos
    FROM public.aluno_jornada_matricula_disciplina j
    WHERE j.status_matricula = 'ativa'
      AND j.professor_id IS NOT NULL
    GROUP BY j.unidade_id, j.professor_id
  ),
  gravados AS (
    INSERT INTO public.professor_carteira_mensal_canonica (
      competencia,
      unidade_id,
      professor_id,
      carteira_alunos,
      fonte,
      auditado_por,
      auditado_em,
      observacoes
    )
    SELECT
      v_competencia,
      pv.unidade_id,
      pv.professor_id,
      COALESCE(c.carteira_alunos, 0),
      p_fonte,
      'cron_fechamento_professores',
      now(),
      'Carteira congelada apos os syncs noturnos do primeiro dia do mes.'
    FROM pares_validos pv
    LEFT JOIN contagens c
      ON c.unidade_id = pv.unidade_id
     AND c.professor_id = pv.professor_id
    ON CONFLICT (competencia, unidade_id, professor_id) DO UPDATE
    SET
      carteira_alunos = EXCLUDED.carteira_alunos,
      fonte = EXCLUDED.fonte,
      auditado_por = EXCLUDED.auditado_por,
      auditado_em = EXCLUDED.auditado_em,
      observacoes = EXCLUDED.observacoes
    WHERE professor_carteira_mensal_canonica.fonte =
      'sync_matriculas_emusys_fechamento_automatico'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_processados FROM gravados;

  RETURN jsonb_build_object(
    'ok', true,
    'competencia', v_competencia,
    'linhas_processadas', v_processados,
    'fonte', p_fonte
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.capturar_carteira_professores_competencia_anterior()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_hoje_local date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_competencia date;
BEGIN
  IF extract(day FROM v_hoje_local) <> 1 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ignorado', true,
      'motivo', 'captura permitida apenas no primeiro dia local do mes'
    );
  END IF;

  v_competencia := (date_trunc('month', v_hoje_local) - interval '1 month')::date;
  RETURN public.capturar_carteira_professores_mensal(v_competencia);
END;
$function$;

REVOKE ALL ON FUNCTION public.capturar_carteira_professores_mensal(date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capturar_carteira_professores_mensal(date, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.capturar_carteira_professores_competencia_anterior()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capturar_carteira_professores_competencia_anterior()
  TO service_role;

DO $block$
BEGIN
  BEGIN
    PERFORM cron.unschedule('snapshot-carteira-professores-mensal');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'snapshot-carteira-professores-mensal',
    '30 3 1 * *',
    'select public.capturar_carteira_professores_competencia_anterior();'
  );
END;
$block$;

COMMENT ON FUNCTION public.capturar_carteira_professores_mensal(date, text) IS
  'Congela a carteira mensal por professor/unidade. Auditorias humanas existentes nao sao sobrescritas.';

COMMENT ON FUNCTION public.capturar_carteira_professores_competencia_anterior() IS
  'Wrapper do pg_cron: captura a competencia anterior no primeiro dia do mes em America/Sao_Paulo.';
