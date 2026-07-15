-- Recompõe a camada semântica sobre a evidência bruta explícita do Emusys.
-- Ausência automática continua sem valor de falta confirmada.

CREATE OR REPLACE VIEW public.vw_aluno_presenca_semantica_v1
WITH (security_invoker = true) AS
WITH evidencia AS (
  SELECT
    ap.*,
    COALESCE(NULLIF(LOWER(ap.emusys_presenca_bruta), ''), LOWER(ap.status))
      AS estado_emusys_bruto,
    ae.emusys_id AS aula_emusys_evento_id,
    ae.cancelada AS aula_cancelada,
    ae.justificada AS aula_justificada,
    ae.categoria AS aula_categoria,
    ae.tipo AS aula_tipo,
    ae.data_hora_inicio,
    LOWER(NULLIF(ae.professor_presenca, '')) AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN
        BOOL_OR(ap.status = 'presente') OVER (PARTITION BY ap.aula_emusys_id)
      ELSE ap.status = 'presente'
    END AS evento_tem_aluno_presente
  FROM public.aluno_presenca ap
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
),
classificada AS (
  SELECT
    e.*,
    LOWER(COALESCE(e.status, 'desconhecido')) AS estado_origem,
    CASE
      WHEN e.respondido_por = 'professor_la_teacher' THEN 'la_teacher'
      WHEN e.respondido_por = 'manual' THEN 'manual'
      WHEN e.respondido_por IN ('emusys', 'sistema') THEN 'emusys'
      ELSE 'desconhecida'
    END AS proveniencia,
    CASE
      WHEN e.status = 'presente' THEN 'registrada'
      WHEN COALESCE(e.aula_cancelada, false) OR COALESCE(e.aula_justificada, false)
        THEN 'nao_aplicavel'
      WHEN e.respondido_por IN ('professor_la_teacher', 'manual')
        AND e.status = 'ausente' THEN 'registrada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND (
          e.evento_tem_aluno_presente
          OR e.professor_presenca_emusys = 'presente'
        ) THEN 'registrada_inferida'
      ELSE 'indeterminada'
    END AS situacao_chamada,
    CASE
      WHEN e.status = 'presente' THEN 'presente'
      WHEN COALESCE(e.aula_cancelada, false) THEN 'aula_cancelada'
      WHEN COALESCE(e.aula_justificada, false) THEN 'aula_justificada'
      WHEN e.respondido_por IN ('professor_la_teacher', 'manual')
        AND e.status = 'ausente' THEN 'falta_confirmada'
      WHEN e.respondido_por IN ('emusys', 'sistema')
        AND e.estado_emusys_bruto = 'ausente'
        AND (
          e.evento_tem_aluno_presente
          OR e.professor_presenca_emusys = 'presente'
        ) THEN 'falta_provavel'
      ELSE 'indeterminado'
    END AS resultado_pedagogico
  FROM evidencia e
)
SELECT
  c.id AS aluno_presenca_id,
  c.aluno_id,
  c.professor_id,
  c.unidade_id,
  c.aula_emusys_id,
  c.aula_emusys_evento_id,
  c.data_aula,
  c.horario_aula,
  c.data_hora_inicio,
  c.curso_nome,
  c.turma_nome,
  c.aula_categoria,
  c.aula_tipo,
  c.estado_origem,
  c.respondido_por,
  c.respondido_em,
  c.proveniencia,
  c.situacao_chamada,
  c.resultado_pedagogico,
  CASE
    WHEN c.resultado_pedagogico IN (
      'presente', 'aula_cancelada', 'aula_justificada', 'falta_confirmada'
    ) THEN 'confirmada'
    WHEN c.resultado_pedagogico = 'falta_provavel' THEN 'provavel'
    ELSE 'desconhecida'
  END AS confianca,
  c.resultado_pedagogico IN ('presente', 'falta_confirmada')
    AS considera_frequencia_denominador,
  c.resultado_pedagogico = 'presente' AS considera_presenca,
  c.resultado_pedagogico = 'falta_confirmada' AS considera_falta,
  c.resultado_pedagogico IN ('aula_cancelada', 'aula_justificada')
    AS exclui_por_evento,
  c.respondido_por IN ('professor_la_teacher', 'manual')
    AND c.respondido_em IS NOT NULL AS respondido_em_confiavel,
  (
    c.status = 'presente'
    AND (COALESCE(c.aula_cancelada, false) OR COALESCE(c.aula_justificada, false))
  ) AS possui_conflito,
  'presenca-semantica-v1.1'::text AS regra_versao,
  c.estado_emusys_bruto,
  c.sincronizado_emusys_em,
  c.professor_presenca_emusys,
  CASE
    WHEN c.respondido_por IN ('professor_la_teacher', 'manual') THEN c.respondido_em
    ELSE c.sincronizado_emusys_em
  END AS evidencia_registrada_em
FROM classificada c;

COMMENT ON VIEW public.vw_aluno_presenca_semantica_v1 IS
  'Interpreta presença humana e evidência bruta Emusys. Ausência Emusys, mesmo com evidência positiva de aula, é apenas provável na v1.1.';

REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_aluno_presenca_semantica_v1 TO service_role;
