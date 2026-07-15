-- Frequencia pedagogica por professor em modo sombra.
-- Grao oficial: professor + unidade + pessoa + evento de aula.
-- A classificacao da ausencia vem exclusivamente da camada semantica versionada.

CREATE OR REPLACE FUNCTION public.get_frequencia_professor_periodo_canonica_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  unidade_id uuid,
  ano integer,
  mes integer,
  total_pessoas_evidencia integer,
  total_eventos_evidencia integer,
  eventos_resultado_confirmado integer,
  presencas_confirmadas integer,
  faltas_confirmadas integer,
  faltas_provaveis integer,
  chamadas_indeterminadas integer,
  eventos_excluidos integer,
  conflitos integer,
  media_presenca numeric,
  taxa_faltas numeric,
  cobertura_resultado_confirmado numeric,
  confianca_presenca text,
  regra_versao text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH parametros AS (
  SELECT
    COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1)) AS inicio,
    COALESCE(
      p_data_fim,
      (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
    ) AS fim
),
mapa_identidade AS MATERIALIZED (
  SELECT
    i.unidade_id,
    i.pessoa_chave,
    local.aluno_id
  FROM public.vw_aluno_identidade_unidade_canonica i
  CROSS JOIN LATERAL unnest(i.aluno_ids_locais) AS local(aluno_id)
),
linhas AS MATERIALIZED (
  SELECT
    p.professor_id,
    p.unidade_id,
    i.pessoa_chave,
    CASE
      WHEN p.aula_emusys_id IS NOT NULL THEN 'aula:' || p.aula_emusys_id::text
      ELSE concat_ws(
        ':',
        'fallback',
        p.data_aula::text,
        p.horario_aula::text,
        COALESCE(p.professor_id::text, 'sem-professor'),
        COALESCE(lower(btrim(p.curso_nome)), 'sem-curso')
      )
    END AS evento_chave,
    p.resultado_pedagogico,
    p.possui_conflito
  FROM public.vw_aluno_presenca_semantica_v1 p
  JOIN mapa_identidade i
    ON i.unidade_id = p.unidade_id
   AND i.aluno_id = p.aluno_id
  CROSS JOIN parametros prm
  WHERE p.professor_id IS NOT NULL
    AND p.data_aula BETWEEN prm.inicio AND prm.fim
    AND (p_unidade_id IS NULL OR p.unidade_id = p_unidade_id)
),
eventos AS (
  SELECT
    l.professor_id,
    l.unidade_id,
    l.pessoa_chave,
    l.evento_chave,
    bool_or(l.resultado_pedagogico = 'presente') AS tem_presenca,
    bool_or(l.resultado_pedagogico = 'falta_confirmada') AS tem_falta_confirmada,
    bool_or(l.resultado_pedagogico = 'falta_provavel') AS tem_falta_provavel,
    bool_or(l.resultado_pedagogico = 'indeterminado') AS tem_indeterminado,
    bool_or(l.resultado_pedagogico = 'aula_cancelada') AS tem_cancelamento,
    bool_or(l.resultado_pedagogico = 'aula_justificada') AS tem_justificativa,
    bool_or(l.possui_conflito) AS conflito_na_origem
  FROM linhas l
  GROUP BY
    l.professor_id,
    l.unidade_id,
    l.pessoa_chave,
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
      ELSE 'indeterminado'
    END AS resultado_evento,
    (
      e.conflito_na_origem
      OR (
        e.tem_presenca
        AND (
          e.tem_falta_confirmada
          OR e.tem_falta_provavel
          OR e.tem_cancelamento
          OR e.tem_justificativa
        )
      )
    ) AS possui_conflito
  FROM eventos e
),
agregado AS (
  SELECT
    c.professor_id,
    c.unidade_id,
    count(DISTINCT c.pessoa_chave)::integer AS total_pessoas_evidencia,
    count(*)::integer AS total_eventos_evidencia,
    count(*) FILTER (
      WHERE c.resultado_evento IN ('presente', 'falta_confirmada')
    )::integer AS eventos_resultado_confirmado,
    count(*) FILTER (WHERE c.resultado_evento = 'presente')::integer
      AS presencas_confirmadas,
    count(*) FILTER (WHERE c.resultado_evento = 'falta_confirmada')::integer
      AS faltas_confirmadas,
    count(*) FILTER (WHERE c.resultado_evento = 'falta_provavel')::integer
      AS faltas_provaveis,
    count(*) FILTER (WHERE c.resultado_evento = 'indeterminado')::integer
      AS chamadas_indeterminadas,
    count(*) FILTER (
      WHERE c.resultado_evento IN ('aula_cancelada', 'aula_justificada')
    )::integer AS eventos_excluidos,
    count(*) FILTER (WHERE c.possui_conflito)::integer AS conflitos
  FROM classificados c
  GROUP BY c.professor_id, c.unidade_id
)
SELECT
  a.professor_id,
  a.unidade_id,
  p_ano AS ano,
  p_mes AS mes,
  a.total_pessoas_evidencia,
  a.total_eventos_evidencia,
  a.eventos_resultado_confirmado,
  a.presencas_confirmadas,
  a.faltas_confirmadas,
  a.faltas_provaveis,
  a.chamadas_indeterminadas,
  a.eventos_excluidos,
  a.conflitos,
  CASE
    WHEN a.eventos_resultado_confirmado > 0 THEN round(
      a.presencas_confirmadas::numeric / a.eventos_resultado_confirmado * 100,
      2
    )
    ELSE NULL::numeric
  END AS media_presenca,
  CASE
    WHEN a.eventos_resultado_confirmado > 0 THEN round(
      a.faltas_confirmadas::numeric / a.eventos_resultado_confirmado * 100,
      2
    )
    ELSE NULL::numeric
  END AS taxa_faltas,
  CASE
    WHEN (
      a.eventos_resultado_confirmado
      + a.faltas_provaveis
      + a.chamadas_indeterminadas
    ) > 0 THEN round(
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
    WHEN a.conflitos > 0 THEN 'baixa'
    WHEN a.eventos_resultado_confirmado = 0 THEN 'sem_base'
    WHEN a.eventos_resultado_confirmado >= 10
      AND a.faltas_provaveis + a.chamadas_indeterminadas = 0 THEN 'alta'
    WHEN a.eventos_resultado_confirmado >= 5
      AND a.eventos_resultado_confirmado::numeric
        / NULLIF(
          a.eventos_resultado_confirmado
          + a.faltas_provaveis
          + a.chamadas_indeterminadas,
          0
        ) >= 0.8 THEN 'media'
    ELSE 'baixa'
  END AS confianca_presenca,
  'frequencia-professor-canonica-v1'::text AS regra_versao
FROM agregado a
ORDER BY a.professor_id, a.unidade_id;
$$;

COMMENT ON FUNCTION public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) IS
  'Frequencia de alunos por professor/unidade/pessoa/evento. Ausencia automatica nunca vira falta confirmada.';

REVOKE ALL ON FUNCTION public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_frequencia_professor_periodo_canonica_v1(
  integer, integer, uuid, date, date
) TO service_role;
