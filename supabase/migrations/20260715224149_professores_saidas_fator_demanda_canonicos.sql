-- Professores: saidas operacionais e fator de demanda por competencia.
-- Aditivo: preserva a v2 e publica uma v3 para os consumidores migrados.

CREATE OR REPLACE FUNCTION public.get_saidas_professor_periodo_canonicas_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  unidade_id uuid,
  carteira_alunos integer,
  evasoes_validas integer,
  nao_renovacoes_validas integer,
  saidas_validas_total integer,
  saidas_score_professor integer,
  mrr_perdido_total numeric,
  mrr_perdido_score numeric,
  taxa_saidas_total numeric,
  taxa_impacto_score numeric,
  taxa_retencao_atribuivel numeric,
  regra_versao text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH limites AS (
    SELECT
      COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1)) AS inicio,
      COALESCE(
        p_data_fim,
        (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
      ) AS fim
  ),
  base_movimentos AS (
    SELECT
      m.id,
      m.professor_id,
      m.unidade_id,
      m.tipo::text AS tipo,
      COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)::numeric AS mrr_perdido,
      COALESCE(ms.conta_score_professor, false) AS conta_score_professor
    FROM public.movimentacoes_admin m
    CROSS JOIN limites l
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    LEFT JOIN LATERAL (
      SELECT motivo.id, motivo.conta_score_professor
      FROM public.motivos_saida motivo
      WHERE motivo.ativo = true
        AND (
          motivo.id = m.motivo_saida_id
          OR (
            m.motivo_saida_id IS NULL
            AND m.motivo IS NOT NULL
            AND lower(btrim(motivo.nome)) = lower(btrim(m.motivo))
          )
        )
      ORDER BY
        CASE WHEN motivo.id = m.motivo_saida_id THEN 0 ELSE 1 END,
        motivo.id
      LIMIT 1
    ) ms ON true
    WHERE m.professor_id IS NOT NULL
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data BETWEEN l.inicio AND l.fim
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      AND public.is_movimentacao_admin_retencao_valida(m.id)
      AND COALESCE(a.is_segundo_curso, false) = false
  ),
  agregadas AS (
    SELECT
      b.professor_id,
      b.unidade_id,
      COUNT(*) FILTER (WHERE tipo = 'evasao')::integer AS evasoes_validas,
      COUNT(*) FILTER (WHERE tipo = 'nao_renovacao')::integer AS nao_renovacoes_validas,
      COUNT(*)::integer AS saidas_validas_total,
      COUNT(*) FILTER (WHERE b.conta_score_professor)::integer AS saidas_score_professor,
      COALESCE(SUM(b.mrr_perdido), 0)::numeric AS mrr_perdido_total,
      COALESCE(SUM(b.mrr_perdido) FILTER (WHERE b.conta_score_professor), 0)::numeric AS mrr_perdido_score
    FROM base_movimentos b
    GROUP BY b.professor_id, b.unidade_id
  ),
  carteira AS (
    SELECT c.professor_id, c.unidade_id, c.carteira_alunos
    FROM public.get_carteira_professor_periodo_canonica(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    ) c
  )
  SELECT
    a.professor_id,
    a.unidade_id,
    COALESCE(c.carteira_alunos, 0)::integer,
    a.evasoes_validas,
    a.nao_renovacoes_validas,
    a.saidas_validas_total,
    a.saidas_score_professor,
    a.mrr_perdido_total,
    a.mrr_perdido_score,
    CASE WHEN COALESCE(c.carteira_alunos, 0) > 0
      THEN ROUND(a.saidas_validas_total::numeric / c.carteira_alunos * 100, 2)
      ELSE 0
    END::numeric AS taxa_saidas_total,
    CASE WHEN COALESCE(c.carteira_alunos, 0) > 0
      THEN ROUND(a.saidas_score_professor::numeric / c.carteira_alunos * 100, 2)
      ELSE 0
    END::numeric AS taxa_impacto_score,
    CASE WHEN COALESCE(c.carteira_alunos, 0) > 0
      THEN GREATEST(
        0,
        100 - ROUND(a.saidas_score_professor::numeric / c.carteira_alunos * 100, 2)
      )
      ELSE 0
    END::numeric AS taxa_retencao_atribuivel,
    'saidas-professor-v1'::text AS regra_versao
  FROM agregadas a
  LEFT JOIN carteira c
    ON c.professor_id = a.professor_id
   AND c.unidade_id = a.unidade_id
  ORDER BY a.professor_id, a.unidade_id;
$$;

COMMENT ON FUNCTION public.get_saidas_professor_periodo_canonicas_v1(
  integer, integer, uuid, date, date
) IS 'Saidas validas por professor e periodo. Total operacional e subconjunto atribuivel ao score permanecem separados.';

REVOKE ALL ON FUNCTION public.get_saidas_professor_periodo_canonicas_v1(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_saidas_professor_periodo_canonicas_v1(
  integer, integer, uuid, date, date
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_fator_demanda_professor_periodo_canonico_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  professor_id integer,
  unidade_id uuid,
  fator_demanda_ponderado numeric,
  fator_demanda_publicavel boolean,
  fator_demanda_cobertura numeric,
  fator_demanda_fonte text,
  fator_demanda_vinculos integer,
  fator_demanda_pessoas integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inicio date := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
  v_periodo_inclui_hoje boolean;
BEGIN
  v_fim := COALESCE(
    p_data_fim,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
  );
  v_periodo_inclui_hoje := current_date BETWEEN v_inicio AND v_fim;

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
      COALESCE(d.curso_id, a.curso_id) AS curso_id,
      'evento'::text AS fonte
    FROM public.aulas_emusys ae
    JOIN public.aula_alunos_emusys aa ON aa.aula_emusys_id = ae.id
    LEFT JOIN public.alunos a ON a.id = aa.aluno_id
    LEFT JOIN public.curso_emusys_depara d
      ON d.unidade_id = ae.unidade_id
     AND d.emusys_disciplina_id = ae.curso_emusys_id
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
      COALESCE(d.curso_id, a.curso_id) AS curso_id,
      'evento'::text AS fonte
    FROM public.aulas_emusys ae
    JOIN public.aluno_presenca ap ON ap.aula_emusys_id = ae.id
    JOIN public.alunos a ON a.id = ap.aluno_id
    LEFT JOIN public.curso_emusys_depara d
      ON d.unidade_id = ae.unidade_id
     AND d.emusys_disciplina_id = ae.curso_emusys_id
    WHERE ae.professor_id IS NOT NULL
      AND ae.data_aula BETWEEN v_inicio AND v_fim
      AND ae.cancelada = false
      AND lower(COALESCE(ae.categoria, 'normal')) = 'normal'
      AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
  ),
  eventos_periodo AS (
    SELECT DISTINCT e.prof_id, e.uid, e.pessoa_chave, e.curso_id, e.fonte
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
      j.curso_id,
      'jornada'::text AS fonte
    FROM public.aluno_jornada_matricula_disciplina j
    LEFT JOIN public.alunos a ON a.id = j.aluno_id
    WHERE v_periodo_inclui_hoje
      AND j.status_matricula = 'ativa'
      AND j.professor_id IS NOT NULL
      AND (p_unidade_id IS NULL OR j.unidade_id = p_unidade_id)
  ),
  legado_periodo AS (
    SELECT DISTINCT
      a.professor_atual_id AS prof_id,
      a.unidade_id AS uid,
      COALESCE(NULLIF(a.emusys_student_id, ''), 'local:' || a.id::text) AS pessoa_chave,
      a.curso_id,
      'legado'::text AS fonte
    FROM public.alunos a
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
      f.curso_id,
      f.fonte
    FROM fontes f
    JOIN fonte_preferida fp
      ON fp.prof_id = f.prof_id
     AND fp.uid = f.uid
     AND fp.fonte = f.fonte
    WHERE f.pessoa_chave IS NOT NULL
  ),
  base_vinculos AS (
    SELECT DISTINCT b.prof_id, b.uid, b.pessoa_chave, b.curso_id, b.fonte
    FROM base_carteira b
  ),
  agregada AS (
    SELECT
      b.prof_id,
      b.uid,
      COUNT(DISTINCT (b.pessoa_chave, b.curso_id))::integer AS vinculos_total,
      COUNT(DISTINCT (b.pessoa_chave, b.curso_id)) FILTER (
        WHERE b.curso_id IS NOT NULL AND c.fator_demanda IS NOT NULL
      )::integer AS vinculos_mapeados,
      COUNT(DISTINCT b.pessoa_chave)::integer AS pessoas_total,
      ROUND(AVG(c.fator_demanda) FILTER (
        WHERE b.curso_id IS NOT NULL AND c.fator_demanda IS NOT NULL
      ), 2) AS fator_medio,
      min(b.fonte)::text AS fonte
    FROM base_vinculos b
    LEFT JOIN public.cursos c ON c.id = b.curso_id
    GROUP BY b.prof_id, b.uid
  )
  SELECT
    a.prof_id,
    a.uid,
    CASE
      WHEN a.vinculos_total > 0 AND a.vinculos_mapeados = a.vinculos_total
        THEN a.fator_medio
      ELSE NULL
    END::numeric AS fator_demanda_ponderado,
    (a.vinculos_total > 0 AND a.vinculos_mapeados = a.vinculos_total) AS fator_demanda_publicavel,
    CASE WHEN a.vinculos_total > 0
      THEN ROUND(a.vinculos_mapeados::numeric / a.vinculos_total, 4)
      ELSE 0
    END::numeric AS fator_demanda_cobertura,
    a.fonte AS fator_demanda_fonte,
    a.vinculos_total AS fator_demanda_vinculos,
    a.pessoas_total AS fator_demanda_pessoas
  FROM agregada a
  ORDER BY a.prof_id, a.uid;
END;
$$;

COMMENT ON FUNCTION public.get_fator_demanda_professor_periodo_canonico_v1(
  integer, integer, uuid, date, date
) IS 'Fator de demanda por vinculos distintos pessoa/curso da fonte preferida da competencia.';

REVOKE ALL ON FUNCTION public.get_fator_demanda_professor_periodo_canonico_v1(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_fator_demanda_professor_periodo_canonico_v1(
  integer, integer, uuid, date, date
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo_canonico_v3(
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
  turmas_elegiveis_media integer,
  presenca_publicavel boolean,
  presenca_cobertura numeric,
  presenca_confianca text,
  presenca_eventos_confirmados integer,
  presenca_eventos_incertos integer,
  presenca_regra_versao text,
  evasoes_validas integer,
  nao_renovacoes_validas integer,
  saidas_validas_total integer,
  saidas_score_professor integer,
  mrr_perdido_total numeric,
  mrr_perdido_score numeric,
  taxa_saidas_total numeric,
  taxa_impacto_score numeric,
  taxa_retencao_atribuivel numeric,
  saidas_regra_versao text,
  fator_demanda_ponderado numeric,
  fator_demanda_publicavel boolean,
  fator_demanda_cobertura numeric,
  fator_demanda_fonte text,
  fator_demanda_vinculos integer,
  fator_demanda_pessoas integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH base AS (
    SELECT *
    FROM public.get_kpis_professor_periodo_canonico_v2(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  saidas AS (
    SELECT *
    FROM public.get_saidas_professor_periodo_canonicas_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  ),
  fator AS (
    SELECT *
    FROM public.get_fator_demanda_professor_periodo_canonico_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    )
  )
  SELECT
    b.professor_id,
    b.professor_nome,
    b.unidade_id,
    b.ano,
    b.mes,
    b.carteira_alunos,
    b.ticket_medio,
    b.media_presenca,
    b.taxa_faltas,
    b.mrr_carteira,
    b.nps_medio,
    b.media_alunos_turma,
    b.experimentais,
    b.experimentais_agendadas,
    b.experimentais_faltas,
    b.matriculas,
    b.matriculas_pos_exp,
    b.matriculas_diretas,
    b.taxa_conversao,
    b.renovacoes,
    b.nao_renovacoes,
    b.taxa_renovacao,
    b.evasoes,
    b.mrr_perdido,
    b.taxa_cancelamento,
    b.total_turmas,
    b.alunos_via_turmas,
    b.turmas_elegiveis_media,
    b.presenca_publicavel,
    b.presenca_cobertura,
    b.presenca_confianca,
    b.presenca_eventos_confirmados,
    b.presenca_eventos_incertos,
    b.presenca_regra_versao,
    COALESCE(s.evasoes_validas, 0)::integer,
    COALESCE(s.nao_renovacoes_validas, 0)::integer,
    COALESCE(s.saidas_validas_total, 0)::integer,
    COALESCE(s.saidas_score_professor, 0)::integer,
    COALESCE(s.mrr_perdido_total, 0)::numeric,
    COALESCE(s.mrr_perdido_score, 0)::numeric,
    COALESCE(s.taxa_saidas_total, 0)::numeric,
    COALESCE(s.taxa_impacto_score, 0)::numeric,
    CASE WHEN b.carteira_alunos > 0
      THEN COALESCE(s.taxa_retencao_atribuivel, 100)
      ELSE 0
    END::numeric,
    COALESCE(s.regra_versao, 'saidas-professor-v1')::text,
    CASE WHEN COALESCE(f.fator_demanda_publicavel, false)
      THEN f.fator_demanda_ponderado
      ELSE NULL
    END::numeric,
    COALESCE(f.fator_demanda_publicavel, false),
    COALESCE(f.fator_demanda_cobertura, 0)::numeric,
    COALESCE(f.fator_demanda_fonte, 'sem_base')::text,
    COALESCE(f.fator_demanda_vinculos, 0)::integer,
    COALESCE(f.fator_demanda_pessoas, 0)::integer
  FROM base b
  LEFT JOIN saidas s
    ON s.professor_id = b.professor_id
   AND s.unidade_id = b.unidade_id
  LEFT JOIN fator f
    ON f.professor_id = b.professor_id
   AND f.unidade_id = b.unidade_id
  ORDER BY b.professor_id, b.unidade_id;
$$;

COMMENT ON FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) IS 'KPIs v2 acrescidos de saidas operacionais, impacto no score e fator de demanda por competencia.';

REVOKE ALL ON FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico_v3(
  integer, integer, uuid, date, date
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_saidas_professor_periodo_detalhes_v1(
  p_professor_id integer,
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL,
  p_data_inicio date DEFAULT NULL,
  p_data_fim date DEFAULT NULL
)
RETURNS TABLE(
  id integer,
  aluno_id integer,
  aluno_nome text,
  unidade_id uuid,
  professor_id integer,
  tipo text,
  tipo_evasao text,
  motivo text,
  motivo_saida_id integer,
  data date,
  mrr_perdido numeric,
  conta_score_professor boolean,
  match_por_texto boolean,
  regra_versao text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_unidade_efetiva uuid;
  v_inicio date := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date := COALESCE(
    p_data_fim,
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date
  );
BEGIN
  IF p_professor_id IS NULL THEN
    RAISE EXCEPTION 'Professor obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_unidade_efetiva := p_unidade_id;
  ELSE
    SELECT u.id, u.perfil, u.unidade_id
      INTO v_usuario_id, v_perfil, v_unidade_usuario
    FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.ativo = true
    LIMIT 1;

    IF v_usuario_id IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: usuario sem cadastro ativo'
        USING ERRCODE = '42501';
    END IF;

    IF v_perfil = 'admin' THEN
      IF NOT public.usuario_tem_permissao(
        v_usuario_id,
        'professores.ver',
        p_unidade_id
      ) THEN
        RAISE EXCEPTION 'Acesso negado: sem permissao para professores'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := p_unidade_id;
    ELSIF v_perfil = 'unidade' THEN
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario) THEN
        RAISE EXCEPTION 'Acesso negado: unidade fora do escopo do usuario'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := v_unidade_usuario;
    ELSE
      IF v_unidade_usuario IS NULL
         OR (p_unidade_id IS NOT NULL AND p_unidade_id <> v_unidade_usuario)
         OR NOT public.usuario_tem_permissao(
           v_usuario_id,
           'professores.ver',
           v_unidade_usuario
         ) THEN
        RAISE EXCEPTION 'Acesso negado: unidade fora do escopo do usuario'
          USING ERRCODE = '42501';
      END IF;
      v_unidade_efetiva := v_unidade_usuario;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.aluno_id,
    COALESCE(m.aluno_nome, a.nome, 'Sem nome')::text,
    m.unidade_id,
    m.professor_id,
    m.tipo::text,
    m.tipo_evasao::text,
    m.motivo,
    m.motivo_saida_id,
    m.data,
    COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)::numeric,
    COALESCE(ms.conta_score_professor, false),
    (m.motivo_saida_id IS NULL AND ms.id IS NOT NULL),
    'saidas-professor-v1'::text
  FROM public.movimentacoes_admin m
  LEFT JOIN public.alunos a ON a.id = m.aluno_id
  LEFT JOIN LATERAL (
    SELECT motivo.id, motivo.conta_score_professor
    FROM public.motivos_saida motivo
    WHERE motivo.ativo = true
      AND (
        motivo.id = m.motivo_saida_id
        OR (
          m.motivo_saida_id IS NULL
          AND m.motivo IS NOT NULL
          AND lower(btrim(motivo.nome)) = lower(btrim(m.motivo))
        )
      )
    ORDER BY
      CASE WHEN motivo.id = m.motivo_saida_id THEN 0 ELSE 1 END,
      motivo.id
    LIMIT 1
  ) ms ON true
  WHERE m.professor_id = p_professor_id
    AND m.tipo IN ('evasao', 'nao_renovacao')
    AND m.data BETWEEN v_inicio AND v_fim
    AND (v_unidade_efetiva IS NULL OR m.unidade_id = v_unidade_efetiva)
    AND public.is_movimentacao_admin_retencao_valida(m.id)
    AND COALESCE(a.is_segundo_curso, false) = false
  ORDER BY m.data DESC, m.id DESC;
END;
$$;

COMMENT ON FUNCTION public.get_saidas_professor_periodo_detalhes_v1(
  integer, integer, integer, uuid, date, date
) IS 'Detalhe seguro das saidas validas de um professor. Cada movimentacao aparece uma vez.';

REVOKE ALL ON FUNCTION public.get_saidas_professor_periodo_detalhes_v1(
  integer, integer, integer, uuid, date, date
) FROM PUBLIC, anon, authenticated, fabio_agent;
GRANT EXECUTE ON FUNCTION public.get_saidas_professor_periodo_detalhes_v1(
  integer, integer, integer, uuid, date, date
) TO authenticated, service_role;

-- Reparo estrito da identidade historica Erick Osmy (Recreio, Emusys 2109).
-- As presencas relacionadas ja possuem professor_id=52 e nao sao regravadas.
DO $$
DECLARE
  v_pendentes integer;
  v_atualizadas integer;
BEGIN
  SELECT COUNT(DISTINCT ae.id)::integer
    INTO v_pendentes
  FROM public.aulas_emusys ae
  JOIN public.professores_unidades pu
    ON ae.unidade_id = pu.unidade_id
   AND ae.emusys_professor_id = pu.emusys_id
  WHERE pu.professor_id = 52
    AND pu.identidade_historica_valida = true
    AND ae.data_aula BETWEEN date '2026-07-08' AND date '2026-07-11'
    AND ae.professor_id IS NULL
    AND COALESCE(ae.sem_acompanhamento, false) = false;

  IF v_pendentes NOT IN (0, 45) THEN
    RAISE EXCEPTION 'Reparo Erick abortado: esperadas 45 ou 0 aulas pendentes, encontradas %', v_pendentes;
  END IF;

  IF v_pendentes = 45 THEN
    UPDATE public.aulas_emusys ae
       SET professor_id = pu.professor_id
      FROM public.professores_unidades pu
     WHERE pu.professor_id = 52
       AND pu.identidade_historica_valida = true
       AND ae.unidade_id = pu.unidade_id
       AND ae.emusys_professor_id = pu.emusys_id
       AND ae.data_aula BETWEEN date '2026-07-08' AND date '2026-07-11'
       AND ae.professor_id IS NULL
       AND COALESCE(ae.sem_acompanhamento, false) = false;

    GET DIAGNOSTICS v_atualizadas = ROW_COUNT;
    IF v_atualizadas <> 45 THEN
      RAISE EXCEPTION 'Reparo Erick abortado: 45 esperadas, % atualizadas', v_atualizadas;
    END IF;
  END IF;
END;
$$;
