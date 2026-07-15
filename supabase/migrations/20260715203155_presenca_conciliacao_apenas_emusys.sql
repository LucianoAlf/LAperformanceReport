-- A revisao posterior alcanca somente ausencias automaticas do Emusys.
-- Respostas humanas do LA Teacher/manual ja sao evidencia explicita e nao entram na fila.

CREATE OR REPLACE VIEW public.vw_aluno_presenca_semantica_v1
WITH (security_invoker = true) AS
WITH evidencia AS (
  SELECT
    ap.*,
    COALESCE(NULLIF(lower(ap.emusys_presenca_bruta), ''), lower(ap.status))
      AS estado_emusys_bruto,
    ae.emusys_id AS aula_emusys_evento_id,
    ae.cancelada AS aula_cancelada,
    ae.justificada AS aula_justificada,
    ae.categoria AS aula_categoria,
    ae.tipo AS aula_tipo,
    ae.data_hora_inicio,
    lower(NULLIF(ae.professor_presenca, '')) AS professor_presenca_emusys,
    CASE
      WHEN ap.aula_emusys_id IS NOT NULL THEN
        bool_or(ap.status = 'presente') OVER (PARTITION BY ap.aula_emusys_id)
      ELSE ap.status = 'presente'
    END AS evento_tem_aluno_presente,
    politica.id AS politica_confiabilidade_id,
    politica.ausencia_emusys_resultado,
    politica.exige_revisao_operacional,
    politica.evidencia AS politica_evidencia,
    revisao.status AS revisao_status
  FROM public.aluno_presenca ap
  LEFT JOIN public.aulas_emusys ae ON ae.id = ap.aula_emusys_id
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM public.presenca_politicas_confiabilidade p
    WHERE p.unidade_id = ap.unidade_id
      AND p.ativa
      AND ap.data_aula BETWEEN p.data_inicio AND p.data_fim
    ORDER BY p.data_inicio DESC, p.created_at DESC, p.id
    LIMIT 1
  ) politica ON true
  LEFT JOIN public.aluno_presenca_revisoes_operacionais revisao
    ON revisao.aluno_presenca_id = ap.id
),
classificada AS (
  SELECT
    e.*,
    lower(COALESCE(e.status, 'desconhecido')) AS estado_origem,
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
        AND e.ausencia_emusys_resultado = 'falta_confirmada'
        THEN 'registrada_atestada'
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
        AND e.ausencia_emusys_resultado = 'falta_confirmada'
        THEN 'falta_confirmada'
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
  'presenca-semantica-v1.2'::text AS regra_versao,
  c.estado_emusys_bruto,
  c.sincronizado_emusys_em,
  c.professor_presenca_emusys,
  CASE
    WHEN c.respondido_por IN ('professor_la_teacher', 'manual') THEN c.respondido_em
    ELSE c.sincronizado_emusys_em
  END AS evidencia_registrada_em,
  c.politica_confiabilidade_id,
  CASE
    WHEN c.respondido_por IN ('professor_la_teacher', 'manual')
      THEN 'resposta_humana_explicita'
    WHEN c.estado_emusys_bruto = 'ausente'
      AND c.politica_confiabilidade_id IS NOT NULL
      THEN c.politica_evidencia
    WHEN c.resultado_pedagogico = 'falta_provavel'
      THEN 'evidencia_de_que_a_aula_ocorreu'
    ELSE 'regra_conservadora_sem_atestado'
  END AS fundamento_confianca,
  (
    COALESCE(c.exige_revisao_operacional, false)
    AND c.respondido_por IN ('emusys', 'sistema')
    AND c.estado_emusys_bruto = 'ausente'
    AND NOT COALESCE(c.aula_cancelada, false)
    AND NOT COALESCE(c.aula_justificada, false)
  ) AS revisao_operacional_exigida,
  CASE
    WHEN COALESCE(c.exige_revisao_operacional, false)
      AND c.respondido_por IN ('emusys', 'sistema')
      AND c.estado_emusys_bruto = 'ausente'
      AND NOT COALESCE(c.aula_cancelada, false)
      AND NOT COALESCE(c.aula_justificada, false)
      THEN COALESCE(c.revisao_status, 'pendente')
    ELSE 'nao_exigida'
  END AS revisao_operacional_status
FROM classificada c;

COMMENT ON VIEW public.vw_aluno_presenca_semantica_v1 IS
  'Presenca semantica v1.2. Politicas temporais podem atestar ausencia Emusys por unidade sem reescrever a evidencia bruta.';

REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vw_aluno_presenca_semantica_v1 TO service_role;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'fabio_agent',
    'lia_acesso_restrito',
    'mila_acesso_restrito',
    'sol_acesso_restrito'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.vw_aluno_presenca_semantica_v1 FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END;
$$;
