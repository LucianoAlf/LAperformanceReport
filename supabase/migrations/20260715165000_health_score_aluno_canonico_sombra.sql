-- Wrapper sombra: preserva os quatro fatores não pedagógicos do cálculo vigente
-- e substitui somente a contribuição de presença por uma entrada canônica.
-- Não escreve em alunos.health_score nem altera o batch em produção.

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
  FROM public.vw_aluno_identidade_unidade_canonica i
  LEFT JOIN public.vw_aluno_frequencia_canonica_v1 f
    ON f.unidade_id = i.unidade_id
   AND f.pessoa_chave = i.pessoa_chave
  WHERE i.unidade_id = v_aluno.unidade_id
    AND p_aluno_id = ANY(i.aluno_ids_locais)
  LIMIT 1;

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

  -- Somente uma base sem eventos incertos e com ao menos quatro resultados
  -- confirmados pode variar a nota. O legado incompleto permanece neutro.
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

COMMENT ON FUNCTION public.calcular_health_score_aluno_v2_sombra(integer) IS
  'Health Score de comparação. Presença canônica só altera a nota com confiança alta; não persiste resultado.';

REVOKE ALL ON FUNCTION public.calcular_health_score_aluno_v2_sombra(integer)
  FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.calcular_health_score_aluno_v2_sombra(integer)
  TO service_role;
