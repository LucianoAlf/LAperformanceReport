-- A Chamada deve seguir o vinculo fisico ja reconciliado. O roster do Emusys
-- pode trocar o participante de lead por aluno depois da aula e nao pode ocultar
-- uma experimental que ja esta ligada com seguranca a sua aula local.
CREATE OR REPLACE VIEW public.vw_experimental_aula_canonica AS
WITH aulas AS (
  SELECT
    ae.id AS aula_local_id,
    ae.unidade_id,
    ae.emusys_id,
    ae.data_aula,
    (ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')::time AS horario_aula
  FROM public.aulas_emusys ae
  WHERE lower(btrim(coalesce(ae.categoria, ''))) = 'experimental'
    AND NOT coalesce(ae.cancelada, false)
), vinculos_ativos AS (
  SELECT
    lea.id,
    lea.lead_experimental_id,
    lea.aula_local_id,
    lea.vinculado_em
  FROM public.lead_experimental_aulas lea
  WHERE lea.aula_local_id IS NOT NULL
    AND lea.substituido_em IS NULL
    AND lea.cancelado_em IS NULL
    AND lea.estado <> 'cancelado'
), candidatas AS (
  -- Caminho principal: a reconciliacao ja confirmou a aula fisica exata.
  SELECT
    ae.aula_local_id,
    le.id AS lead_experimental_id,
    0 AS prioridade,
    CASE
      WHEN le.emusys_lead_id IS NOT NULL THEN 'lead:' || le.emusys_lead_id::text
      WHEN coalesce(le.aluno_id, l.aluno_id) IS NOT NULL THEN 'aluno:' || coalesce(le.aluno_id, l.aluno_id)::text
      ELSE 'registro:' || le.id::text
    END AS pessoa_chave
  FROM vinculos_ativos lea
  JOIN aulas ae ON ae.aula_local_id = lea.aula_local_id
  JOIN public.lead_experimentais le ON le.id = lea.lead_experimental_id
  LEFT JOIN public.leads l ON l.id = le.lead_id
  WHERE le.unidade_id = ae.unidade_id
    AND le.status <> 'cancelada'

  UNION ALL

  -- Legado: mantem a leitura antiga apenas quando ainda nao houve reconciliacao.
  SELECT
    ae.aula_local_id,
    le.id AS lead_experimental_id,
    1 AS prioridade,
    CASE
      WHEN le.emusys_lead_id IS NOT NULL THEN 'lead:' || le.emusys_lead_id::text
      WHEN coalesce(le.aluno_id, l.aluno_id) IS NOT NULL THEN 'aluno:' || coalesce(le.aluno_id, l.aluno_id)::text
      ELSE 'registro:' || le.id::text
    END AS pessoa_chave
  FROM aulas ae
  JOIN public.lead_experimentais le
    ON le.unidade_id = ae.unidade_id
   AND le.emusys_aula_id = ae.emusys_id
  LEFT JOIN public.leads l ON l.id = le.lead_id
  WHERE le.status <> 'cancelada'
    AND NOT EXISTS (
      SELECT 1
      FROM vinculos_ativos va
      WHERE va.lead_experimental_id = le.id
    )
    AND EXISTS (
      SELECT 1
      FROM public.aula_alunos_emusys aa
      WHERE aa.aula_emusys_id = ae.aula_local_id
        AND (
          (le.emusys_lead_id IS NOT NULL AND aa.emusys_lead_id = le.emusys_lead_id)
          OR (
            coalesce(le.aluno_id, l.aluno_id) IS NOT NULL
            AND aa.aluno_id = coalesce(le.aluno_id, l.aluno_id)
          )
        )
    )

  UNION ALL

  SELECT
    ae.aula_local_id,
    le.id AS lead_experimental_id,
    2 AS prioridade,
    CASE
      WHEN le.emusys_lead_id IS NOT NULL THEN 'lead:' || le.emusys_lead_id::text
      WHEN coalesce(le.aluno_id, l.aluno_id) IS NOT NULL THEN 'aluno:' || coalesce(le.aluno_id, l.aluno_id)::text
      ELSE 'registro:' || le.id::text
    END AS pessoa_chave
  FROM aulas ae
  JOIN public.lead_experimentais le
    ON le.unidade_id = ae.unidade_id
   AND le.emusys_aula_id IS NULL
   AND le.data_experimental = ae.data_aula
   AND le.horario_experimental = ae.horario_aula
  LEFT JOIN public.leads l ON l.id = le.lead_id
  WHERE le.status <> 'cancelada'
    AND NOT EXISTS (
      SELECT 1
      FROM vinculos_ativos va
      WHERE va.lead_experimental_id = le.id
    )
    AND EXISTS (
      SELECT 1
      FROM public.aula_alunos_emusys aa
      WHERE aa.aula_emusys_id = ae.aula_local_id
        AND (
          (le.emusys_lead_id IS NOT NULL AND aa.emusys_lead_id = le.emusys_lead_id)
          OR (
            coalesce(le.aluno_id, l.aluno_id) IS NOT NULL
            AND aa.aluno_id = coalesce(le.aluno_id, l.aluno_id)
          )
        )
    )
), ranqueadas AS (
  SELECT
    c.aula_local_id,
    c.lead_experimental_id,
    row_number() OVER (
      PARTITION BY c.aula_local_id, c.pessoa_chave
      ORDER BY c.prioridade, c.lead_experimental_id DESC
    ) AS posicao
  FROM candidatas c
)
SELECT aula_local_id, lead_experimental_id
FROM ranqueadas
WHERE posicao = 1;

COMMENT ON VIEW public.vw_experimental_aula_canonica IS
  'Experimentais visiveis na Agenda. O caminho principal usa lead_experimental_aulas ativo, reconciliado contra a aula fisica do Emusys; o roster so permanece como fallback legado sem vinculo.';
