-- Leitura canônica estreita para ficha/Health Score. Filtra a pessoa antes de
-- agregar presença, evitando recalcular a base inteira a cada chamada.

CREATE OR REPLACE FUNCTION public.get_frequencia_aluno_canonica_v1(
  p_aluno_id integer
)
RETURNS TABLE(
  unidade_id uuid,
  pessoa_chave text,
  aluno_id_canonico integer,
  aluno_ids_locais integer[],
  identidade_confianca text,
  total_eventos_evidencia integer,
  eventos_resultado_confirmado integer,
  presencas_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  eventos_excluidos integer,
  conflitos integer,
  taxa_presenca_geral numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  regra_versao text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH identidade AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_confianca
  FROM public.vw_aluno_identidade_unidade_canonica i
  WHERE p_aluno_id = ANY(i.aluno_ids_locais)
  LIMIT 1
),
linhas AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    i.aluno_id_canonico,
    i.aluno_ids_locais,
    i.identidade_confianca,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN 'aula:' || ap.aula_emusys_id::text
      ELSE concat_ws(
        ':',
        'fallback',
        ap.data_aula::text,
        ap.horario_aula::text,
        COALESCE(ap.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(ap.curso_nome)), 'sem-curso')
      )
    END AS evento_chave,
    ap.status,
    ap.respondido_por,
    COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''), lower(ap.status))
      AS estado_emusys_bruto,
    COALESCE(ae.cancelada, false) AS aula_cancelada,
    COALESCE(ae.justificada, false) AS aula_justificada,
    lower(NULLIF(ae.professor_presenca, '')) AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NULL THEN ap.status = 'presente'
      ELSE EXISTS (
        SELECT 1
        FROM public.aluno_presenca ap_evento
        WHERE ap_evento.aula_emusys_id = ap.aula_emusys_id
          AND ap_evento.status = 'presente'
      )
    END AS evento_tem_aluno_presente
  FROM identidade i
  JOIN public.aluno_presenca ap
    ON ap.unidade_id = i.unidade_id
   AND ap.aluno_id = ANY(i.aluno_ids_locais)
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
  WHERE ap.data_aula <= CURRENT_DATE
),
eventos AS (
  SELECT
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_confianca,
    l.evento_chave,
    BOOL_OR(l.aula_cancelada) AS tem_cancelamento,
    BOOL_OR(l.aula_justificada) AS tem_justificativa,
    BOOL_OR(l.status = 'presente') AS tem_presenca,
    BOOL_OR(
      l.status = 'ausente'
      AND l.respondido_por IN ('professor_la_teacher', 'manual')
    ) AS tem_falta_confirmada,
    BOOL_OR(
      l.estado_emusys_bruto = 'ausente'
      AND l.respondido_por IN ('emusys', 'sistema')
      AND (
        l.evento_tem_aluno_presente
        OR l.professor_presenca_emusys = 'presente'
      )
    ) AS tem_falta_provavel,
    BOOL_OR(
      l.estado_emusys_bruto = 'ausente'
      AND l.respondido_por IN ('emusys', 'sistema')
    ) AS tem_ausencia_automatica
  FROM linhas l
  GROUP BY
    l.unidade_id,
    l.pessoa_chave,
    l.aluno_id_canonico,
    l.aluno_ids_locais,
    l.identidade_confianca,
    l.evento_chave
),
classificados AS (
  SELECT
    e.*,
    CASE
      WHEN e.tem_cancelamento THEN 'aula_cancelada'
      WHEN e.tem_justificativa THEN 'aula_justificada'
      WHEN e.tem_presenca THEN 'presente'
      WHEN e.tem_falta_confirmada THEN 'falta_confirmada'
      WHEN e.tem_falta_provavel THEN 'falta_provavel'
      WHEN e.tem_ausencia_automatica THEN 'indeterminado'
      ELSE 'indeterminado'
    END AS resultado_evento,
    (
      e.tem_presenca
      AND (
        e.tem_falta_confirmada
        OR e.tem_falta_provavel
        OR e.tem_cancelamento
        OR e.tem_justificativa
      )
    ) AS possui_conflito
  FROM eventos e
),
agregado AS (
  SELECT
    c.unidade_id,
    c.pessoa_chave,
    c.aluno_id_canonico,
    c.aluno_ids_locais,
    c.identidade_confianca,
    COUNT(*)::integer AS total_eventos_evidencia,
    COUNT(*) FILTER (
      WHERE c.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_resultado_confirmado,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'presente')::integer
      AS presencas_confirmadas,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'falta_confirmada')::integer
      AS faltas_confirmadas,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'falta_provavel')::integer
      AS faltas_provaveis,
    COUNT(*) FILTER (WHERE c.resultado_evento = 'indeterminado')::integer
      AS chamadas_indeterminadas,
    COUNT(*) FILTER (
      WHERE c.resultado_evento IN ('aula_cancelada', 'aula_justificada')
    )::integer AS eventos_excluidos,
    COUNT(*) FILTER (WHERE c.possui_conflito)::integer AS conflitos
  FROM classificados c
  GROUP BY
    c.unidade_id,
    c.pessoa_chave,
    c.aluno_id_canonico,
    c.aluno_ids_locais,
    c.identidade_confianca
)
SELECT
  a.unidade_id,
  a.pessoa_chave,
  a.aluno_id_canonico,
  a.aluno_ids_locais,
  a.identidade_confianca,
  a.total_eventos_evidencia,
  a.eventos_resultado_confirmado,
  a.presencas_confirmadas,
  a.faltas_confirmadas,
  a.faltas_provaveis,
  a.chamadas_indeterminadas,
  a.eventos_excluidos,
  a.conflitos,
  CASE
    WHEN a.eventos_resultado_confirmado > 0 THEN ROUND(
      a.presencas_confirmadas::numeric / a.eventos_resultado_confirmado,
      6
    )
    ELSE NULL::numeric
  END AS taxa_presenca_geral,
  CASE
    WHEN (
      a.eventos_resultado_confirmado
      + a.faltas_provaveis
      + a.chamadas_indeterminadas
    ) > 0 THEN ROUND(
      a.eventos_resultado_confirmado::numeric
      / (
        a.eventos_resultado_confirmado
        + a.faltas_provaveis
        + a.chamadas_indeterminadas
      ),
      6
    )
    ELSE 0::numeric
  END AS cobertura_resultado_confirmado,
  CASE
    WHEN a.identidade_confianca = 'baixa' OR a.conflitos > 0 THEN 'baixa'
    WHEN a.eventos_resultado_confirmado = 0 THEN 'sem_base'
    WHEN a.faltas_provaveis + a.chamadas_indeterminadas = 0
      AND a.eventos_resultado_confirmado >= 4 THEN 'alta'
    WHEN a.eventos_resultado_confirmado >= 4
      AND a.eventos_resultado_confirmado::numeric
        / NULLIF(
          a.eventos_resultado_confirmado
          + a.faltas_provaveis
          + a.chamadas_indeterminadas,
          0
        ) >= 0.8 THEN 'media'
    ELSE 'baixa'
  END AS confianca_presenca,
  'frequencia-aluno-canonica-v1'::text AS regra_versao
FROM agregado a;
$$;

COMMENT ON FUNCTION public.get_frequencia_aluno_canonica_v1(integer) IS
  'Frequência canônica estreita por pessoa/unidade. Ausência automática não vira falta confirmada.';

REVOKE ALL ON FUNCTION public.get_frequencia_aluno_canonica_v1(integer)
  FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_frequencia_aluno_canonica_v1(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.calcular_health_score_aluno_v2_sombra(
  p_aluno_id integer
)
RETURNS TABLE(
  score integer,
  score_legado integer,
  status character varying,
  status_legado character varying,
  detalhes jsonb,
  presenca_confianca text,
  presenca_cobertura numeric,
  modelo_pronto boolean,
  regra_versao text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aluno record;
  v_legado record;
  v_config record;
  v_frequencia record;
  v_detalhes_base jsonb := '[]'::jsonb;
  v_contrib_legada numeric := 0;
  v_peso_presenca numeric := 10;
  v_score_presenca numeric := 75;
  v_contrib_canonica numeric := 7.5;
  v_score_novo integer := 0;
  v_status_novo varchar;
  v_confianca text := 'sem_base';
  v_cobertura numeric := 0;
  v_modelo_pronto boolean := false;
BEGIN
  SELECT a.id, a.unidade_id
    INTO v_aluno
  FROM public.alunos a
  WHERE a.id = p_aluno_id;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      0,
      0,
      'erro'::varchar,
      'erro'::varchar,
      jsonb_build_array(jsonb_build_object('erro', 'Aluno nao encontrado')),
      'sem_base'::text,
      0::numeric,
      false,
      'health-score-aluno-v2-sombra'::text;
    RETURN;
  END IF;

  SELECT l.score, l.status, l.detalhes
    INTO v_legado
  FROM public.calcular_health_score_aluno(p_aluno_id) l;

  SELECT c.*
    INTO v_config
  FROM public.config_health_score_aluno c
  WHERE c.unidade_id = v_aluno.unidade_id OR c.unidade_id IS NULL
  ORDER BY c.unidade_id NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    v_peso_presenca := COALESCE(v_config.peso_presenca, 10);
  END IF;

  SELECT f.*
    INTO v_frequencia
  FROM public.get_frequencia_aluno_canonica_v1(p_aluno_id) f;

  SELECT
    COALESCE(
      SUM(COALESCE(NULLIF(item->>'contribuicao', '')::numeric, 0))
        FILTER (WHERE item->>'fator' ILIKE 'Presen%'),
      0
    ),
    COALESCE(
      jsonb_agg(item) FILTER (WHERE item->>'fator' NOT ILIKE 'Presen%'),
      '[]'::jsonb
    )
    INTO v_contrib_legada, v_detalhes_base
  FROM jsonb_array_elements(COALESCE(v_legado.detalhes, '[]'::jsonb)) item;

  v_confianca := COALESCE(v_frequencia.confianca_presenca, 'sem_base');
  v_cobertura := COALESCE(v_frequencia.cobertura_resultado_confirmado, 0);

  IF v_confianca = 'alta'
     AND COALESCE(v_frequencia.eventos_resultado_confirmado, 0) >= 4
     AND v_frequencia.taxa_presenca_geral IS NOT NULL THEN
    v_score_presenca := ROUND(v_frequencia.taxa_presenca_geral * 100, 2);
    v_modelo_pronto := true;
  ELSE
    v_score_presenca := 75;
    v_modelo_pronto := false;
  END IF;

  v_contrib_canonica := v_score_presenca * v_peso_presenca / 100;
  v_score_novo := ROUND(
    GREATEST(
      0,
      LEAST(
        100,
        COALESCE(v_legado.score, 0)::numeric
          - v_contrib_legada
          + v_contrib_canonica
      )
    )
  )::integer;

  v_status_novo := CASE
    WHEN v_score_novo >= COALESCE(v_config.limite_saudavel, 70) THEN 'saudavel'
    WHEN v_score_novo >= COALESCE(v_config.limite_atencao, 40) THEN 'atencao'
    ELSE 'critico'
  END;

  RETURN QUERY
  SELECT
    v_score_novo,
    COALESCE(v_legado.score, 0)::integer,
    v_status_novo,
    COALESCE(v_legado.status, 'erro')::varchar,
    v_detalhes_base || jsonb_build_array(jsonb_build_object(
      'fator', 'Presenca canonica',
      'valor', CASE
        WHEN v_modelo_pronto THEN ROUND(v_frequencia.taxa_presenca_geral * 100, 1)::text || '%'
        ELSE 'neutro: base em auditoria'
      END,
      'score', v_score_presenca,
      'peso', v_peso_presenca,
      'contribuicao', ROUND(v_contrib_canonica, 1),
      'confianca', v_confianca,
      'cobertura', v_cobertura,
      'eventos_confirmados', COALESCE(v_frequencia.eventos_resultado_confirmado, 0),
      'eventos_incertos', COALESCE(v_frequencia.faltas_provaveis, 0)
        + COALESCE(v_frequencia.chamadas_indeterminadas, 0),
      'regra', 'somente confianca alta altera a nota'
    )),
    v_confianca,
    v_cobertura,
    v_modelo_pronto,
    'health-score-aluno-v2-sombra'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.calcular_health_score_aluno_v2_sombra(integer)
  FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.calcular_health_score_aluno_v2_sombra(integer)
  TO service_role;
