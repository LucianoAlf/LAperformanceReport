-- Ajusta apenas o read model em sombra. Jornadas antigas podem ter aluno_id local,
-- mas ainda nao carregar emusys_aluno_id; nesse caso a identidade externa da linha
-- local deve prevalecer sobre o fallback local.

CREATE OR REPLACE VIEW public.vw_professor_carteira_pessoa_canonica_sombra
WITH (security_invoker = true) AS
WITH jornadas AS (
  SELECT
    j.*,
    COALESCE(
      j.emusys_aluno_id,
      CASE
        WHEN a.emusys_student_id ~ '^[0-9]+$' THEN a.emusys_student_id::bigint
        ELSE NULL::bigint
      END
    ) AS emusys_aluno_id_resolvido,
    CASE
      WHEN COALESCE(
        j.emusys_aluno_id,
        CASE
          WHEN a.emusys_student_id ~ '^[0-9]+$' THEN a.emusys_student_id::bigint
          ELSE NULL::bigint
        END
      ) IS NOT NULL
        THEN 'emusys:' || COALESCE(
          j.emusys_aluno_id,
          CASE
            WHEN a.emusys_student_id ~ '^[0-9]+$' THEN a.emusys_student_id::bigint
            ELSE NULL::bigint
          END
        )::text
      ELSE 'local:' || j.aluno_id::text
    END AS pessoa_chave
  FROM public.aluno_jornada_matricula_disciplina j
  LEFT JOIN public.alunos a ON a.id = j.aluno_id
  WHERE j.status_matricula = 'ativa'
    AND j.professor_id IS NOT NULL
    AND (
      j.emusys_aluno_id IS NOT NULL
      OR j.aluno_id IS NOT NULL
    )
),
base AS (
  SELECT
    j.*,
    p.nome AS professor_nome,
    i.aluno_id_canonico,
    i.emusys_aluno_id AS identidade_emusys_aluno_id,
    i.nome AS aluno_nome,
    i.identidade_fonte,
    i.identidade_confianca,
    i.linhas_locais,
    i.linhas_ativas
  FROM jornadas j
  JOIN public.professores p
    ON p.id = j.professor_id
   AND p.ativo = true
  JOIN public.professores_unidades pu
    ON pu.professor_id = p.id
   AND pu.unidade_id = j.unidade_id
   AND pu.emusys_ativo = true
   AND pu.validacao_status <> 'ignorado'
   AND (
     j.emusys_professor_id IS NULL
     OR pu.emusys_id IS NULL
     OR pu.emusys_id::bigint = j.emusys_professor_id
   )
  LEFT JOIN public.vw_aluno_identidade_unidade_canonica i
    ON i.unidade_id = j.unidade_id
   AND i.pessoa_chave = j.pessoa_chave
)
SELECT
  b.unidade_id,
  b.professor_id,
  b.professor_nome,
  b.pessoa_chave,
  COALESCE(
    MAX(b.identidade_emusys_aluno_id),
    MAX(b.emusys_aluno_id_resolvido)
  ) AS emusys_aluno_id,
  MAX(b.aluno_id_canonico) AS aluno_id_canonico,
  MAX(b.aluno_nome) AS aluno_nome,
  COALESCE(MAX(b.identidade_fonte),
    CASE
      WHEN b.pessoa_chave LIKE 'emusys:%' THEN 'jornada_emusys_sem_linha_aluno'
      ELSE 'jornada_aluno_id_local_fallback'
    END
  ) AS identidade_fonte,
  COALESCE(MAX(b.identidade_confianca),
    CASE WHEN b.pessoa_chave LIKE 'emusys:%' THEN 'media' ELSE 'baixa' END
  ) AS identidade_confianca,
  MAX(b.linhas_locais) AS linhas_locais,
  MAX(b.linhas_ativas) AS linhas_ativas,
  COUNT(DISTINCT b.id)::integer AS qtd_jornadas_ativas,
  ARRAY_AGG(DISTINCT b.id ORDER BY b.id) AS jornada_ids,
  ARRAY_AGG(DISTINCT b.emusys_matricula_disciplina_id ORDER BY b.emusys_matricula_disciplina_id)
    FILTER (WHERE b.emusys_matricula_disciplina_id IS NOT NULL) AS emusys_matricula_disciplina_ids,
  ARRAY_AGG(DISTINCT b.curso_id ORDER BY b.curso_id)
    FILTER (WHERE b.curso_id IS NOT NULL) AS curso_ids,
  ARRAY_AGG(DISTINCT b.curso_nome_emusys ORDER BY b.curso_nome_emusys)
    FILTER (WHERE NULLIF(BTRIM(b.curso_nome_emusys), '') IS NOT NULL) AS cursos_emusys,
  MIN(b.data_primeira_aula) AS primeira_aula,
  MAX(b.data_ultima_aula) AS ultima_aula,
  MAX(b.ultima_sincronizacao_emusys) AS ultima_sincronizacao_emusys,
  'aluno_jornada_matricula_disciplina'::text AS fonte_carteira
FROM base b
GROUP BY b.unidade_id, b.professor_id, b.professor_nome, b.pessoa_chave;

COMMENT ON VIEW public.vw_professor_carteira_pessoa_canonica_sombra IS
  'Carteira atual por pessoa/professor/unidade. Resolve ID Emusys pela jornada ou linha local e nao usa presenca.';

REVOKE ALL ON TABLE public.vw_professor_carteira_pessoa_canonica_sombra
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_professor_carteira_pessoa_canonica_sombra
  TO service_role;
