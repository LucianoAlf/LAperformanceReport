-- Read models em sombra do contrato canonico pedagogico.
-- Nenhum consumidor de producao e trocado nesta migration.

CREATE OR REPLACE VIEW public.vw_aluno_identidade_unidade_canonica
WITH (security_invoker = true) AS
WITH base AS (
  SELECT
    a.*,
    CASE
      WHEN NULLIF(BTRIM(a.emusys_student_id), '') IS NOT NULL
        THEN 'emusys:' || BTRIM(a.emusys_student_id)
      ELSE 'local:' || a.id::text
    END AS pessoa_chave
  FROM public.alunos a
  WHERE a.unidade_id IS NOT NULL
),
ranqueada AS (
  SELECT
    a.*,
    ROW_NUMBER() OVER (
      PARTITION BY a.unidade_id, a.pessoa_chave
      ORDER BY
        CASE WHEN a.arquivado_em IS NULL THEN 0 ELSE 1 END,
        CASE WHEN LOWER(COALESCE(a.status, '')) = 'ativo' THEN 0 ELSE 1 END,
        a.updated_at DESC NULLS LAST,
        a.id DESC
    ) AS ordem_preferencia
  FROM base a
),
agregada AS (
  SELECT
    b.unidade_id,
    b.pessoa_chave,
    ARRAY_AGG(b.id ORDER BY b.id) AS aluno_ids_locais,
    COUNT(*)::integer AS linhas_locais,
    COUNT(*) FILTER (
      WHERE b.arquivado_em IS NULL
        AND LOWER(COALESCE(b.status, '')) = 'ativo'
    )::integer AS linhas_ativas
  FROM base b
  GROUP BY b.unidade_id, b.pessoa_chave
)
SELECT
  r.unidade_id,
  r.pessoa_chave,
  CASE
    WHEN r.pessoa_chave LIKE 'emusys:%'
      THEN SUBSTRING(r.pessoa_chave FROM 8)::bigint
    ELSE NULL::bigint
  END AS emusys_aluno_id,
  r.id AS aluno_id_canonico,
  a.aluno_ids_locais,
  a.linhas_locais,
  a.linhas_ativas,
  (a.linhas_ativas > 1) AS possui_multiplas_linhas_ativas,
  r.nome,
  r.data_nascimento,
  r.status,
  r.arquivado_em,
  r.telefone,
  r.whatsapp,
  r.email,
  r.responsavel_nome,
  r.responsavel_telefone,
  COALESCE(r.foto_url, r.photo_url) AS foto_url,
  CASE
    WHEN r.pessoa_chave LIKE 'emusys:%' THEN 'emusys_aluno_id'
    ELSE 'aluno_id_local_fallback'
  END AS identidade_fonte,
  CASE
    WHEN r.pessoa_chave LIKE 'emusys:%' THEN 'alta'
    ELSE 'baixa'
  END AS identidade_confianca,
  r.updated_at AS identidade_atualizada_em
FROM ranqueada r
JOIN agregada a
  ON a.unidade_id = r.unidade_id
 AND a.pessoa_chave = r.pessoa_chave
WHERE r.ordem_preferencia = 1;

COMMENT ON VIEW public.vw_aluno_identidade_unidade_canonica IS
  'Uma pessoa operacional por unidade. Prioriza ID Emusys; fallback local fica explicitamente com baixa confianca.';

CREATE OR REPLACE VIEW public.vw_professor_carteira_pessoa_canonica_sombra
WITH (security_invoker = true) AS
WITH jornadas AS (
  SELECT
    j.*,
    CASE
      WHEN j.emusys_aluno_id IS NOT NULL
        THEN 'emusys:' || j.emusys_aluno_id::text
      ELSE 'local:' || j.aluno_id::text
    END AS pessoa_chave
  FROM public.aluno_jornada_matricula_disciplina j
  WHERE j.status_matricula = 'ativa'
    AND j.professor_id IS NOT NULL
    AND (j.emusys_aluno_id IS NOT NULL OR j.aluno_id IS NOT NULL)
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
  MAX(b.identidade_emusys_aluno_id) AS emusys_aluno_id,
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
  'Carteira atual por pessoa/professor/unidade, derivada somente da jornada ativa e sem qualquer agregado de presenca.';

REVOKE ALL ON TABLE public.vw_aluno_identidade_unidade_canonica
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.vw_professor_carteira_pessoa_canonica_sombra
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.vw_aluno_identidade_unidade_canonica TO service_role;
GRANT SELECT ON TABLE public.vw_professor_carteira_pessoa_canonica_sombra TO service_role;
