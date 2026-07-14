-- Carteira do professor por competencia.
-- Mes fechado: grade/roster e presencas materializadas do Emusys.
-- Mes aberto: jornada ativa por matricula/disciplina.
-- O cadastro atual de alunos permanece apenas como fallback e fonte financeira.

DO $$
BEGIN
  IF to_regprocedure(
    'public.get_kpis_professor_periodo_canonico_base_20260711(integer,integer,uuid,date,date)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.get_kpis_professor_periodo_base_legado_20260713(integer,integer,uuid,date,date)'
  ) IS NULL THEN
    EXECUTE $rename$
      ALTER FUNCTION public.get_kpis_professor_periodo_canonico_base_20260711(
        integer, integer, uuid, date, date
      ) RENAME TO get_kpis_professor_periodo_base_legado_20260713
    $rename$;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_carteira_professor_periodo_canonica(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE (
  professor_id integer,
  unidade_id uuid,
  carteira_alunos integer,
  media_alunos_turma numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  fonte_carteira text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_inicio date := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
BEGIN
  v_fim := COALESCE(p_data_fim, (v_inicio + interval '1 month - 1 day')::date);

  RETURN QUERY
  WITH roster_periodo AS (
    SELECT DISTINCT
      ae.professor_id AS prof_id,
      ae.unidade_id AS uid,
      COALESCE(
        aa.aluno_emusys_id::text,
        NULLIF(a.emusys_student_id, ''),
        NULLIF(aa.aluno_chave, ''),
        CASE WHEN aa.aluno_id IS NOT NULL THEN 'local:' || aa.aluno_id::text END
      ) AS pessoa_chave,
      CASE
        WHEN NULLIF(btrim(ae.turma_nome), '') IS NOT NULL THEN
          'turma:'
          || COALESCE(ae.curso_emusys_id::text, lower(btrim(ae.curso_nome)), 'sem-curso')
          || ':' || lower(btrim(ae.turma_nome))
        ELSE
          'individual:' || COALESCE(
            ae.matricula_disciplina_id::text,
            COALESCE(
              aa.aluno_emusys_id::text,
              NULLIF(a.emusys_student_id, ''),
              NULLIF(aa.aluno_chave, ''),
              CASE WHEN aa.aluno_id IS NOT NULL THEN 'local:' || aa.aluno_id::text END
            )
            || ':' || COALESCE(ae.curso_emusys_id::text, lower(btrim(ae.curso_nome)), 'sem-curso')
            || ':' || extract(isodow FROM ae.data_aula)::text
            || ':' || to_char(
              ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo',
              'HH24:MI'
            ),
            'evento:' || ae.id::text
          )
      END AS turma_chave,
      NOT COALESCE(c.is_projeto_banda, false) AS elegivel_media,
      'evento'::text AS fonte
    FROM public.aulas_emusys ae
    JOIN public.aula_alunos_emusys aa ON aa.aula_emusys_id = ae.id
    LEFT JOIN public.alunos a ON a.id = aa.aluno_id
    LEFT JOIN public.cursos c ON c.id = ae.curso_emusys_id
    WHERE ae.professor_id IS NOT NULL
      AND ae.data_aula BETWEEN v_inicio AND v_fim
      AND ae.cancelada = false
      AND lower(COALESCE(ae.categoria, 'normal')) = 'normal'
      AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
  ),
  presenca_periodo AS (
    SELECT DISTINCT
      ae.professor_id AS prof_id,
      ae.unidade_id AS uid,
      COALESCE(NULLIF(a.emusys_student_id, ''), 'local:' || a.id::text) AS pessoa_chave,
      CASE
        WHEN NULLIF(btrim(ae.turma_nome), '') IS NOT NULL THEN
          'turma:'
          || COALESCE(ae.curso_emusys_id::text, lower(btrim(ae.curso_nome)), 'sem-curso')
          || ':' || lower(btrim(ae.turma_nome))
        ELSE
          'individual:' || COALESCE(
            ae.matricula_disciplina_id::text,
            COALESCE(NULLIF(a.emusys_student_id, ''), 'local:' || a.id::text)
            || ':' || COALESCE(ae.curso_emusys_id::text, lower(btrim(ae.curso_nome)), 'sem-curso')
            || ':' || extract(isodow FROM ae.data_aula)::text
            || ':' || to_char(
              ae.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo',
              'HH24:MI'
            ),
            'evento:' || ae.id::text
          )
      END AS turma_chave,
      NOT COALESCE(c.is_projeto_banda, false) AS elegivel_media,
      'evento'::text AS fonte
    FROM public.aulas_emusys ae
    JOIN public.aluno_presenca ap ON ap.aula_emusys_id = ae.id
    JOIN public.alunos a ON a.id = ap.aluno_id
    LEFT JOIN public.cursos c ON c.id = ae.curso_emusys_id
    WHERE ae.professor_id IS NOT NULL
      AND ae.data_aula BETWEEN v_inicio AND v_fim
      AND ae.cancelada = false
      AND lower(COALESCE(ae.categoria, 'normal')) = 'normal'
      AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
  ),
  eventos_periodo AS (
    SELECT DISTINCT
      e.prof_id,
      e.uid,
      e.pessoa_chave,
      e.turma_chave,
      e.elegivel_media,
      e.fonte
    FROM (
      SELECT * FROM roster_periodo
      UNION ALL
      SELECT * FROM presenca_periodo
    ) e
    WHERE e.pessoa_chave IS NOT NULL
  ),
  jornada_atual AS (
    SELECT DISTINCT
      j.professor_id AS prof_id,
      j.unidade_id AS uid,
      COALESCE(
        j.emusys_aluno_id::text,
        NULLIF(a.emusys_student_id, ''),
        CASE WHEN j.aluno_id IS NOT NULL THEN 'local:' || j.aluno_id::text END
      ) AS pessoa_chave,
      CASE
        WHEN NULLIF(
          btrim(j.payload_snapshot #>> '{disciplina,nome_turma}'),
          ''
        ) IS NOT NULL THEN
          'turma:'
          || COALESCE(j.curso_id::text, lower(btrim(j.curso_nome_emusys)), 'sem-curso')
          || ':' || lower(btrim(j.payload_snapshot #>> '{disciplina,nome_turma}'))
        WHEN lower(COALESCE(j.payload_snapshot #>> '{disciplina,tipo}', '')) = 'turma'
          AND j.dia_semana IS NOT NULL
          AND j.horario IS NOT NULL THEN
          'turma:'
          || COALESCE(j.curso_id::text, lower(btrim(j.curso_nome_emusys)), 'sem-curso')
          || ':' || lower(j.dia_semana)
          || ':' || j.horario
        ELSE
          'individual:' || COALESCE(
            j.emusys_matricula_disciplina_id::text,
            j.id::text
          )
      END AS turma_chave,
      NOT COALESCE(c.is_projeto_banda, false) AS elegivel_media,
      'jornada'::text AS fonte
    FROM public.aluno_jornada_matricula_disciplina j
    LEFT JOIN public.alunos a ON a.id = j.aluno_id
    LEFT JOIN public.cursos c ON c.id = j.curso_id
    WHERE current_date BETWEEN v_inicio AND v_fim
      AND j.status_matricula = 'ativa'
      AND j.professor_id IS NOT NULL
      AND (p_unidade_id IS NULL OR j.unidade_id = p_unidade_id)
  ),
  legado_periodo AS (
    SELECT DISTINCT
      a.professor_atual_id AS prof_id,
      a.unidade_id AS uid,
      COALESCE(NULLIF(a.emusys_student_id, ''), 'local:' || a.id::text) AS pessoa_chave,
      CASE
        WHEN a.dia_aula IS NOT NULL AND a.horario_aula IS NOT NULL THEN
          'legado:' || a.curso_id::text
          || ':' || lower(a.dia_aula)
          || ':' || a.horario_aula::text
        ELSE 'legado-individual:' || a.id::text
      END AS turma_chave,
      NOT COALESCE(c.is_projeto_banda, false) AS elegivel_media,
      'legado'::text AS fonte
    FROM public.alunos a
    JOIN public.cursos c ON c.id = a.curso_id
    WHERE a.professor_atual_id IS NOT NULL
      AND COALESCE(a.data_matricula, a.data_inicio_contrato, a.created_at::date) <= v_fim
      AND (a.data_saida IS NULL OR a.data_saida > v_fim)
      AND (
        a.arquivado_em IS NULL
        OR (a.arquivado_em AT TIME ZONE 'America/Sao_Paulo')::date > v_fim
      )
      AND (
        lower(COALESCE(a.status, 'ativo')) IN ('ativo', 'ativa')
        OR a.data_saida > v_fim
      )
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  ),
  fontes AS (
    SELECT * FROM jornada_atual
    UNION ALL
    SELECT * FROM eventos_periodo
    UNION ALL
    SELECT * FROM legado_periodo
  ),
  fonte_preferida AS (
    SELECT
      f.prof_id,
      f.uid,
      CASE
        WHEN bool_or(f.fonte = 'jornada') THEN 'jornada'
        WHEN bool_or(f.fonte = 'evento') THEN 'evento'
        ELSE 'legado'
      END AS fonte
    FROM fontes f
    WHERE f.pessoa_chave IS NOT NULL
    GROUP BY f.prof_id, f.uid
  ),
  base_carteira AS (
    SELECT DISTINCT
      f.prof_id,
      f.uid,
      f.pessoa_chave,
      f.turma_chave,
      f.elegivel_media,
      f.fonte
    FROM fontes f
    JOIN fonte_preferida fp
      ON fp.prof_id = f.prof_id
     AND fp.uid = f.uid
     AND fp.fonte = f.fonte
    WHERE f.pessoa_chave IS NOT NULL
  ),
  carteira AS (
    SELECT
      b.prof_id,
      b.uid,
      COUNT(DISTINCT b.pessoa_chave)::integer AS carteira_alunos,
      min(b.fonte)::text AS fonte_carteira
    FROM base_carteira b
    GROUP BY b.prof_id, b.uid
  ),
  turmas_calc AS (
    SELECT
      b.prof_id,
      b.uid,
      COUNT(DISTINCT b.turma_chave)::integer AS total_turmas,
      COUNT(DISTINCT b.pessoa_chave || '@' || b.turma_chave) FILTER (
        WHERE b.elegivel_media
      )::integer AS alunos_via_turmas,
      COUNT(DISTINCT b.turma_chave) FILTER (
        WHERE b.elegivel_media
      )::integer AS turmas_elegiveis_media,
      CASE
        WHEN COUNT(DISTINCT b.turma_chave) FILTER (
          WHERE b.elegivel_media
        ) > 0 THEN ROUND(
          COUNT(DISTINCT b.pessoa_chave || '@' || b.turma_chave) FILTER (
            WHERE b.elegivel_media
          )::numeric
          / COUNT(DISTINCT b.turma_chave) FILTER (
            WHERE b.elegivel_media
          ),
          2
        )
        ELSE 0
      END AS media_alunos_turma
    FROM base_carteira b
    GROUP BY b.prof_id, b.uid
  )
  SELECT
    c.prof_id,
    c.uid,
    c.carteira_alunos,
    COALESCE(tc.media_alunos_turma, 0)::numeric(10,2),
    COALESCE(tc.total_turmas, 0),
    COALESCE(tc.alunos_via_turmas, 0),
    COALESCE(tc.turmas_elegiveis_media, 0),
    c.fonte_carteira
  FROM carteira c
  LEFT JOIN turmas_calc tc
    ON tc.prof_id = c.prof_id
   AND tc.uid = c.uid
  ORDER BY c.prof_id, c.uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo_canonico_base_20260711(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  professor_nome text,
  unidade_id uuid,
  ano integer,
  mes integer,
  carteira_alunos integer,
  ticket_medio numeric,
  media_presenca numeric,
  taxa_faltas numeric,
  mrr_carteira numeric,
  nps_medio numeric,
  media_alunos_turma numeric,
  experimentais integer,
  experimentais_agendadas integer,
  experimentais_faltas integer,
  matriculas integer,
  matriculas_pos_exp integer,
  matriculas_diretas integer,
  taxa_conversao numeric,
  renovacoes integer,
  nao_renovacoes integer,
  taxa_renovacao numeric,
  evasoes integer,
  mrr_perdido numeric,
  taxa_cancelamento numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH legado AS (
    SELECT *
    FROM public.get_kpis_professor_periodo_base_legado_20260713(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  carteira_canonica AS (
    SELECT *
    FROM public.get_carteira_professor_periodo_canonica(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  )
  SELECT
    COALESCE(l.professor_id, cc.professor_id)::integer AS professor_id,
    COALESCE(l.professor_nome, p.nome)::text AS professor_nome,
    COALESCE(l.unidade_id, cc.unidade_id)::uuid AS unidade_id,
    COALESCE(l.ano, p_ano)::integer AS ano,
    COALESCE(l.mes, p_mes)::integer AS mes,
    COALESCE(cc.carteira_alunos, l.carteira_alunos, 0)::integer AS carteira_alunos,
    COALESCE(l.ticket_medio, 0)::numeric AS ticket_medio,
    COALESCE(l.media_presenca, 0)::numeric AS media_presenca,
    COALESCE(l.taxa_faltas, 0)::numeric AS taxa_faltas,
    COALESCE(l.mrr_carteira, 0)::numeric AS mrr_carteira,
    COALESCE(l.nps_medio, 0)::numeric AS nps_medio,
    COALESCE(cc.media_alunos_turma, l.media_alunos_turma, 0)::numeric AS media_alunos_turma,
    COALESCE(l.experimentais, 0)::integer AS experimentais,
    COALESCE(l.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
    COALESCE(l.experimentais_faltas, 0)::integer AS experimentais_faltas,
    COALESCE(l.matriculas, 0)::integer AS matriculas,
    COALESCE(l.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
    COALESCE(l.matriculas_diretas, 0)::integer AS matriculas_diretas,
    COALESCE(l.taxa_conversao, 0)::numeric AS taxa_conversao,
    COALESCE(l.renovacoes, 0)::integer AS renovacoes,
    COALESCE(l.nao_renovacoes, 0)::integer AS nao_renovacoes,
    COALESCE(l.taxa_renovacao, 0)::numeric AS taxa_renovacao,
    COALESCE(l.evasoes, 0)::integer AS evasoes,
    COALESCE(l.mrr_perdido, 0)::numeric AS mrr_perdido,
    CASE
      WHEN COALESCE(cc.carteira_alunos, l.carteira_alunos, 0) > 0 THEN ROUND(
        COALESCE(l.evasoes, 0)::numeric
        / COALESCE(cc.carteira_alunos, l.carteira_alunos) * 100,
        2
      )
      ELSE 0
    END::numeric AS taxa_cancelamento,
    COALESCE(cc.total_turmas, l.total_turmas, 0)::integer AS total_turmas,
    COALESCE(cc.alunos_via_turmas, l.alunos_via_turmas, 0)::integer AS alunos_via_turmas,
    COALESCE(cc.turmas_elegiveis_media, l.turmas_elegiveis_media, 0)::integer AS turmas_elegiveis_media
  FROM legado l
  FULL JOIN carteira_canonica cc
    ON cc.professor_id = l.professor_id
   AND cc.unidade_id = l.unidade_id
  LEFT JOIN public.professores p
    ON p.id = COALESCE(l.professor_id, cc.professor_id)
  ORDER BY COALESCE(l.professor_id, cc.professor_id), COALESCE(l.unidade_id, cc.unidade_id);
$$;

REVOKE ALL ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo_canonico_base_20260711(
  integer, integer, uuid, date, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico_base_20260711(
  integer, integer, uuid, date, date
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_carteira_professor_periodo_canonica(
  integer, integer, uuid, date, date
) IS 'Carteira canonica por professor: grade/presenca Emusys em meses fechados e jornada ativa no mes aberto.';
