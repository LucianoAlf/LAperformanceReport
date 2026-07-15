-- Recupera o vinculo real da matricula pelo id do lead Emusys presente no raw.
-- Cada conversao nasce de um evento realizado; por construcao, nunca excede
-- o denominador do professor.

CREATE OR REPLACE FUNCTION public.get_experimentais_professor_canonicos_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes_inicio integer,
  p_mes_fim integer DEFAULT NULL
)
RETURNS TABLE (
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  unidade_nome text,
  realizadas_emusys integer,
  faltas_emusys integer,
  canceladas_emusys integer,
  matriculas_pos_exp integer,
  taxa_exp_mat numeric
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH periodo AS (
  SELECT
    make_date(p_ano, p_mes_inicio, 1) AS inicio,
    (
      make_date(p_ano, COALESCE(NULLIF(p_mes_fim, 0), p_mes_inicio), 1)
      + interval '1 month'
    ) AS fim_exclusivo
),
unidades_alvo AS (
  SELECT u.id AS unidade_id, u.nome AS unidade_nome
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
raw_eventos AS (
  SELECT
    r.id,
    r.professor_id,
    COALESCE(max(p.nome), max(NULLIF(r.professor_nome, '')), 'Sem professor') AS professor_nome,
    r.unidade_id,
    ua.unidade_nome,
    r.situacao_operacional,
    r.data_aula,
    a.id AS aluno_matriculado_id,
    row_number() OVER (
      PARTITION BY r.unidade_id, a.id
      ORDER BY r.data_aula DESC NULLS LAST, r.id DESC
    ) AS ordem_conversao_aluno
  FROM public.emusys_experimentais_raw r
  JOIN periodo pr ON true
  JOIN unidades_alvo ua ON ua.unidade_id = r.unidade_id
  LEFT JOIN public.professores p ON p.id = r.professor_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(le.aluno_id, l.aluno_id, al_origem.id) AS aluno_id
    FROM public.lead_experimentais le
    LEFT JOIN public.leads l ON l.id = le.lead_id
    LEFT JOIN public.alunos al_origem
      ON al_origem.lead_origem_id = le.lead_id
     AND al_origem.unidade_id = le.unidade_id
    WHERE le.unidade_id = r.unidade_id
      AND le.data_experimental = r.data_aula
      AND r.situacao_operacional IN ('presente', 'matriculado')
      AND (
        le.id = r.lead_experimental_id
        OR (r.lead_id IS NOT NULL AND le.lead_id = r.lead_id)
        OR (
          NULLIF(r.payload #>> '{aluno,id_lead}', '') ~ '^[0-9]+$'
          AND le.emusys_lead_id = (r.payload #>> '{aluno,id_lead}')::bigint
        )
      )
      AND COALESCE(le.aluno_id, l.aluno_id, al_origem.id) IS NOT NULL
    ORDER BY
      (le.id = r.lead_experimental_id) DESC,
      (le.professor_experimental_id = r.professor_id) DESC,
      le.id DESC
    LIMIT 1
  ) vinculo ON true
  LEFT JOIN public.alunos a
    ON a.id = COALESCE(r.aluno_id, vinculo.aluno_id)
   AND a.unidade_id = r.unidade_id
   AND r.situacao_operacional IN ('presente', 'matriculado')
   AND lower(COALESCE(a.status, '')) <> 'excluido'
   AND a.data_matricula >= pr.inicio::date
   AND a.data_matricula < pr.fim_exclusivo::date
   AND COALESCE(a.valor_passaporte, 0) > 0
  WHERE r.data_aula >= pr.inicio::date
    AND r.data_aula < pr.fim_exclusivo::date
    AND r.professor_id IS NOT NULL
  GROUP BY
    r.id,
    r.professor_id,
    r.unidade_id,
    ua.unidade_nome,
    r.situacao_operacional,
    r.data_aula,
    a.id
),
raw_por_professor AS (
  SELECT
    r.professor_id,
    COALESCE(max(r.professor_nome), 'Sem professor') AS professor_nome,
    r.unidade_id,
    r.unidade_nome,
    count(*) FILTER (
      WHERE r.situacao_operacional IN ('presente', 'matriculado')
    )::integer AS realizadas_emusys,
    count(*) FILTER (
      WHERE r.situacao_operacional = 'faltou'
    )::integer AS faltas_emusys,
    count(*) FILTER (
      WHERE r.situacao_operacional = 'cancelada'
    )::integer AS canceladas_emusys,
    count(*) FILTER (
      WHERE r.aluno_matriculado_id IS NOT NULL
        AND r.ordem_conversao_aluno = 1
    )::integer AS raw_matriculas_pos_exp
  FROM raw_eventos r
  GROUP BY r.professor_id, r.unidade_id, r.unidade_nome
)
SELECT
  r.professor_id,
  r.professor_nome,
  r.unidade_id,
  r.unidade_nome,
  r.realizadas_emusys,
  r.faltas_emusys,
  r.canceladas_emusys,
  r.raw_matriculas_pos_exp AS matriculas_pos_exp,
  CASE
    WHEN r.realizadas_emusys > 0 THEN round(
      r.raw_matriculas_pos_exp::numeric / r.realizadas_emusys::numeric * 100,
      1
    )
    ELSE 0
  END AS taxa_exp_mat
FROM raw_por_professor r
ORDER BY r.realizadas_emusys DESC, r.raw_matriculas_pos_exp DESC, r.professor_nome;
$$;

REVOKE ALL ON FUNCTION public.get_experimentais_professor_canonicos_v1(
  uuid, integer, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_experimentais_professor_canonicos_v1(
  uuid, integer, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_experimentais_professor_canonicos_v1(
  uuid, integer, integer, integer
) IS 'Conversao do professor por evento bruto Emusys realizado e matricula vinculada pelo aluno/lead do proprio evento.';
