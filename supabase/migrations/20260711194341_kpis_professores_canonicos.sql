-- P26 - KPIs canonicos de professores por competencia.
-- Regra aprovada pela coordenacao em 11/07/2026:
--   carga total inclui projetos/bandas;
--   media pedagogica usa apenas turmas regulares;
--   um aluno conta uma vez em cada turma regular distinta.

CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo_canonico(
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
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inicio date := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim date;
BEGIN
  v_fim := COALESCE(p_data_fim, (v_inicio + interval '1 month - 1 day')::date);

  RETURN QUERY
  WITH base_carteira AS (
    SELECT
      a.professor_atual_id AS prof_id,
      a.unidade_id AS uid,
      a.id AS vinculo_id,
      a.valor_parcela,
      COALESCE(NULLIF(a.emusys_student_id, ''), 'local:' || a.id::text) AS pessoa_chave,
      a.curso_id::text || '@' || COALESCE(a.dia_aula, '') || ':' || COALESCE(a.horario_aula::text, '') AS turma_chave,
      COALESCE(NULLIF(a.emusys_student_id, ''), 'local:' || a.id::text)
        || '@' || a.curso_id::text || '@' || COALESCE(a.dia_aula, '') || ':' || COALESCE(a.horario_aula::text, '') AS ocupacao_chave,
      a.dia_aula IS NOT NULL AND a.horario_aula IS NOT NULL AS tem_horario,
      NOT COALESCE(c.is_projeto_banda, false) AS elegivel_media
    FROM public.alunos a
    JOIN public.cursos c ON c.id = a.curso_id
    WHERE a.professor_atual_id IS NOT NULL
      AND COALESCE(a.status, 'ativo') <> 'lead'
      AND COALESCE(a.data_matricula, a.data_inicio_contrato, a.created_at::date) <= v_fim
      AND (a.data_saida IS NULL OR a.data_saida > v_fim)
      AND (
        a.arquivado_em IS NULL
        OR (a.arquivado_em AT TIME ZONE 'America/Sao_Paulo')::date > v_fim
      )
      AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
  ),
  carteira AS (
    SELECT
      b.prof_id,
      b.uid,
      COUNT(*)::integer AS carteira_alunos,
      CASE WHEN COUNT(*) FILTER (WHERE b.valor_parcela > 0) > 0
        THEN ROUND(
          SUM(CASE WHEN b.valor_parcela > 0 THEN b.valor_parcela ELSE 0 END)
          / COUNT(*) FILTER (WHERE b.valor_parcela > 0),
          2
        )
        ELSE 0
      END AS ticket_medio,
      SUM(CASE WHEN b.valor_parcela > 0 THEN b.valor_parcela ELSE 0 END) AS mrr_carteira
    FROM base_carteira b
    GROUP BY b.prof_id, b.uid
  ),
  turmas_calc AS (
    SELECT
      b.prof_id,
      b.uid,
      COUNT(DISTINCT b.turma_chave) FILTER (WHERE b.tem_horario)::integer AS total_turmas,
      COUNT(DISTINCT b.ocupacao_chave) FILTER (
        WHERE b.tem_horario AND b.elegivel_media
      )::integer AS alunos_via_turmas,
      COUNT(DISTINCT b.turma_chave) FILTER (
        WHERE b.tem_horario AND b.elegivel_media
      )::integer AS turmas_elegiveis_media,
      CASE WHEN COUNT(DISTINCT b.turma_chave) FILTER (
        WHERE b.tem_horario AND b.elegivel_media
      ) > 0 THEN ROUND(
        COUNT(DISTINCT b.ocupacao_chave) FILTER (
          WHERE b.tem_horario AND b.elegivel_media
        )::numeric
        / COUNT(DISTINCT b.turma_chave) FILTER (
          WHERE b.tem_horario AND b.elegivel_media
        ),
        2
      ) ELSE 0 END AS media_alunos_turma
    FROM base_carteira b
    GROUP BY b.prof_id, b.uid
  ),
  presenca AS (
    SELECT
      ae.professor_id AS prof_id,
      ae.unidade_id AS uid,
      ROUND(
        COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric
        / NULLIF(COUNT(*)::numeric, 0) * 100,
        2
      ) AS media_presenca
    FROM public.aulas_emusys ae
    JOIN public.aluno_presenca ap ON ap.aula_emusys_id = ae.id
    WHERE ae.data_aula BETWEEN v_inicio AND v_fim
      AND ae.cancelada = false
      AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
    GROUP BY ae.professor_id, ae.unidade_id
  ),
  experimentais AS (
    SELECT
      le.professor_experimental_id AS prof_id,
      le.unidade_id AS uid,
      COUNT(*) FILTER (WHERE le.status = 'experimental_agendada')::integer AS experimentais_agendadas,
      COUNT(*) FILTER (WHERE le.status IN ('experimental_realizada', 'convertido'))::integer AS experimentais,
      COUNT(*) FILTER (WHERE le.status = 'experimental_faltou')::integer AS experimentais_faltas,
      COUNT(*) FILTER (
        WHERE le.status IN ('experimental_realizada', 'convertido')
          AND (l.converteu = true OR l.status IN ('convertido', 'matriculado'))
      )::integer AS matriculas_pos_exp,
      0::integer AS matriculas_diretas,
      COUNT(*) FILTER (
        WHERE le.status IN ('experimental_realizada', 'convertido')
          AND (l.converteu = true OR l.status IN ('convertido', 'matriculado'))
      )::integer AS matriculas
    FROM public.lead_experimentais le
    LEFT JOIN public.leads l ON l.id = le.lead_id
    WHERE le.professor_experimental_id IS NOT NULL
      AND le.data_experimental BETWEEN v_inicio AND v_fim
      AND (p_unidade_id IS NULL OR le.unidade_id = p_unidade_id)
    GROUP BY le.professor_experimental_id, le.unidade_id
  ),
  renovacoes AS (
    SELECT
      COALESCE(m.professor_id, a.professor_atual_id) AS prof_id,
      m.unidade_id AS uid,
      COUNT(*) FILTER (WHERE m.tipo = 'renovacao')::integer AS renovacoes,
      COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao')::integer AS nao_renovacoes,
      COUNT(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao'))::integer AS total_contratos
    FROM public.movimentacoes_admin m
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
      AND m.tipo IN ('renovacao', 'nao_renovacao')
      AND public.is_movimentacao_admin_retencao_valida(m.id)
      AND m.data BETWEEN v_inicio AND v_fim
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
    GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
  ),
  evasoes AS (
    SELECT
      m.professor_id AS prof_id,
      m.unidade_id AS uid,
      COUNT(*)::integer AS evasoes,
      SUM(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)) AS mrr_perdido
    FROM public.movimentacoes_admin m
    LEFT JOIN public.alunos a ON a.id = m.aluno_id
    LEFT JOIN public.motivos_saida ms ON ms.id = COALESCE(
      m.motivo_saida_id,
      (SELECT ms2.id FROM public.motivos_saida ms2
       WHERE ms2.nome ILIKE m.motivo AND ms2.ativo = true LIMIT 1)
    )
    WHERE m.professor_id IS NOT NULL
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND public.is_movimentacao_admin_retencao_valida(m.id)
      AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
      AND ms.conta_score_professor = true
      AND m.data BETWEEN v_inicio AND v_fim
      AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
    GROUP BY m.professor_id, m.unidade_id
  ),
  unidades_prof AS (
    SELECT prof_id, uid FROM carteira
    UNION SELECT prof_id, uid FROM presenca
    UNION SELECT prof_id, uid FROM turmas_calc
    UNION SELECT prof_id, uid FROM experimentais
    UNION SELECT prof_id, uid FROM renovacoes
    UNION SELECT prof_id, uid FROM evasoes
  )
  SELECT
    p.id,
    p.nome::text,
    up.uid,
    p_ano,
    p_mes,
    COALESCE(c.carteira_alunos, 0),
    COALESCE(c.ticket_medio, 0)::numeric(10,2),
    COALESCE(pr.media_presenca, 0)::numeric(5,2),
    COALESCE(100 - pr.media_presenca, 0)::numeric(5,2),
    COALESCE(c.mrr_carteira, 0)::numeric(12,2),
    COALESCE(p.nps_medio, 0)::numeric(5,2),
    COALESCE(tc.media_alunos_turma, 0)::numeric(5,2),
    COALESCE(ex.experimentais, 0),
    COALESCE(ex.experimentais_agendadas, 0),
    COALESCE(ex.experimentais_faltas, 0),
    COALESCE(ex.matriculas, 0),
    COALESCE(ex.matriculas_pos_exp, 0),
    COALESCE(ex.matriculas_diretas, 0),
    CASE WHEN COALESCE(ex.experimentais, 0) > 0
      THEN ROUND(COALESCE(ex.matriculas_pos_exp, 0)::numeric / ex.experimentais * 100, 2)
      ELSE 0 END::numeric(5,2),
    COALESCE(r.renovacoes, 0),
    COALESCE(r.nao_renovacoes, 0),
    CASE WHEN COALESCE(r.total_contratos, 0) > 0
      THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2)
      ELSE 0 END::numeric(5,2),
    COALESCE(ev.evasoes, 0),
    COALESCE(ev.mrr_perdido, 0)::numeric(12,2),
    CASE WHEN COALESCE(c.carteira_alunos, 0) > 0
      THEN ROUND(COALESCE(ev.evasoes, 0)::numeric / c.carteira_alunos * 100, 2)
      ELSE 0 END::numeric(5,2),
    COALESCE(tc.total_turmas, 0),
    COALESCE(tc.alunos_via_turmas, 0),
    COALESCE(tc.turmas_elegiveis_media, 0)
  FROM unidades_prof up
  JOIN public.professores p ON p.id = up.prof_id
  LEFT JOIN carteira c ON c.prof_id = p.id AND c.uid = up.uid
  LEFT JOIN presenca pr ON pr.prof_id = p.id AND pr.uid = up.uid
  LEFT JOIN turmas_calc tc ON tc.prof_id = p.id AND tc.uid = up.uid
  LEFT JOIN experimentais ex ON ex.prof_id = p.id AND ex.uid = up.uid
  LEFT JOIN renovacoes r ON r.prof_id = p.id AND r.uid = up.uid
  LEFT JOIN evasoes ev ON ev.prof_id = p.id AND ev.uid = up.uid
  WHERE p.ativo = true
  ORDER BY p.id, up.uid;
END;
$$;

COMMENT ON FUNCTION public.get_kpis_professor_periodo_canonico(integer, integer, uuid, date, date)
IS 'Fonte canonica mensal de KPIs de professores. Carga total inclui projetos; media alunos/turma exclui cursos is_projeto_banda.';

GRANT EXECUTE ON FUNCTION public.get_kpis_professor_periodo_canonico(integer, integer, uuid, date, date)
TO authenticated, service_role;

ALTER FUNCTION public.get_dados_relatorio_coordenacao(uuid, integer, integer)
RENAME TO get_dados_relatorio_coordenacao_legado_20260711;

CREATE OR REPLACE FUNCTION public.get_dados_relatorio_coordenacao(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_kpis jsonb;
  v_totais jsonb;
  v_top_carteira jsonb;
  v_top_media jsonb;
  v_top_presenca jsonb;
BEGIN
  v_result := public.get_dados_relatorio_coordenacao_legado_20260711(
    p_unidade_id,
    p_ano,
    p_mes
  );

  WITH raw AS (
    SELECT *
    FROM public.get_kpis_professor_periodo_canonico(
      p_ano,
      p_mes,
      p_unidade_id,
      NULL,
      NULL
    )
  ),
  consolidados AS (
    SELECT
      r.professor_id,
      MAX(r.professor_nome) AS professor_nome,
      SUM(r.carteira_alunos)::integer AS carteira_alunos,
      CASE WHEN SUM(r.carteira_alunos) > 0
        THEN ROUND(SUM(r.ticket_medio * r.carteira_alunos) / SUM(r.carteira_alunos), 2)
        ELSE 0 END AS ticket_medio,
      CASE WHEN SUM(r.carteira_alunos) > 0
        THEN ROUND(SUM(r.media_presenca * r.carteira_alunos) / SUM(r.carteira_alunos), 2)
        ELSE 0 END AS media_presenca,
      SUM(r.mrr_carteira) AS mrr_carteira,
      MAX(r.nps_medio) AS nps_medio,
      SUM(r.total_turmas)::integer AS total_turmas,
      SUM(r.alunos_via_turmas)::integer AS alunos_via_turmas,
      SUM(r.turmas_elegiveis_media)::integer AS turmas_elegiveis_media,
      CASE WHEN SUM(r.turmas_elegiveis_media) > 0
        THEN ROUND(SUM(r.alunos_via_turmas)::numeric / SUM(r.turmas_elegiveis_media), 2)
        ELSE 0 END AS media_alunos_turma,
      SUM(r.experimentais)::integer AS experimentais,
      SUM(r.experimentais_agendadas)::integer AS experimentais_agendadas,
      SUM(r.experimentais_faltas)::integer AS experimentais_faltas,
      SUM(r.matriculas)::integer AS matriculas,
      SUM(r.matriculas_pos_exp)::integer AS matriculas_pos_exp,
      SUM(r.matriculas_diretas)::integer AS matriculas_diretas,
      CASE WHEN SUM(r.experimentais) > 0
        THEN ROUND(SUM(r.matriculas_pos_exp)::numeric / SUM(r.experimentais) * 100, 2)
        ELSE 0 END AS taxa_conversao,
      SUM(r.renovacoes)::integer AS renovacoes,
      SUM(r.nao_renovacoes)::integer AS nao_renovacoes,
      CASE WHEN SUM(r.renovacoes) + SUM(r.nao_renovacoes) > 0
        THEN ROUND(SUM(r.renovacoes)::numeric / (SUM(r.renovacoes) + SUM(r.nao_renovacoes)) * 100, 2)
        ELSE 0 END AS taxa_renovacao,
      SUM(r.evasoes)::integer AS evasoes,
      SUM(r.mrr_perdido) AS mrr_perdido,
      CASE WHEN SUM(r.carteira_alunos) > 0
        THEN ROUND(SUM(r.evasoes)::numeric / SUM(r.carteira_alunos) * 100, 2)
        ELSE 0 END AS taxa_cancelamento
    FROM raw r
    GROUP BY r.professor_id
  ),
  pesos AS (
    SELECT
      COALESCE(ch.peso_taxa_crescimento, 0)::numeric AS crescimento,
      COALESCE(ch.peso_media_turma, 20)::numeric AS media_turma,
      COALESCE(ch.peso_retencao, 25)::numeric AS retencao,
      COALESCE(ch.peso_conversao, 20)::numeric AS conversao,
      COALESCE(ch.peso_presenca, 25)::numeric AS presenca,
      COALESCE(ch.peso_evasoes, 10)::numeric AS evasoes,
      COALESCE(ch.limite_saudavel, 70)::numeric AS limite_saudavel,
      COALESCE(ch.limite_atencao, 50)::numeric AS limite_atencao
    FROM (SELECT 1) seed
    LEFT JOIN LATERAL (
      SELECT cfg.*
      FROM public.config_health_score_professor cfg
      WHERE cfg.unidade_id = p_unidade_id OR cfg.unidade_id IS NULL
      ORDER BY (cfg.unidade_id = p_unidade_id) DESC NULLS LAST
      LIMIT 1
    ) ch ON true
  ),
  pontuados AS (
    SELECT
      c.*,
      ROUND((
        LEAST(100, GREATEST(0, ((0 + 10)::numeric / 30) * 100)) * (p.crescimento / 100)
        + LEAST(100, GREATEST(0, c.media_alunos_turma / 2 * 100)) * (p.media_turma / 100)
        + GREATEST(0, 100 - c.taxa_cancelamento) * (p.retencao / 100)
        + LEAST(100, GREATEST(0, c.taxa_conversao)) * (p.conversao / 100)
        + LEAST(100, GREATEST(0, c.media_presenca)) * (p.presenca / 100)
        + GREATEST(0, 100 - (c.taxa_cancelamento * 10)) * (p.evasoes / 100)
      ), 1) AS health_score,
      p.limite_saudavel,
      p.limite_atencao
    FROM consolidados c
    CROSS JOIN pesos p
  ),
  finais AS (
    SELECT
      p.*,
      CASE
        WHEN p.health_score >= p.limite_saudavel THEN 'saudavel'
        WHEN p.health_score >= p.limite_atencao THEN 'atencao'
        ELSE 'critico'
      END AS health_status,
      COALESCE((
        SELECT array_agg(DISTINCT c.nome ORDER BY c.nome)
        FROM public.professores_cursos pc
        JOIN public.cursos c ON c.id = pc.curso_id
        WHERE pc.professor_id = p.professor_id
      ), ARRAY[]::text[]) AS cursos
    FROM pontuados p
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professor_id', f.professor_id,
    'professor_nome', f.professor_nome,
    'carteira_alunos', f.carteira_alunos,
    'ticket_medio', f.ticket_medio,
    'media_presenca', f.media_presenca,
    'media_alunos_turma', f.media_alunos_turma,
    'total_turmas', f.total_turmas,
    'alunos_via_turmas', f.alunos_via_turmas,
    'turmas_elegiveis_media', f.turmas_elegiveis_media,
    'nps_medio', f.nps_medio,
    'experimentais', f.experimentais,
    'experimentais_agendadas', f.experimentais_agendadas,
    'experimentais_faltas', f.experimentais_faltas,
    'matriculas', f.matriculas,
    'matriculas_pos_exp', f.matriculas_pos_exp,
    'matriculas_diretas', f.matriculas_diretas,
    'taxa_conversao', f.taxa_conversao,
    'renovacoes', f.renovacoes,
    'nao_renovacoes', f.nao_renovacoes,
    'taxa_renovacao', f.taxa_renovacao,
    'evasoes', f.evasoes,
    'mrr_carteira', f.mrr_carteira,
    'mrr_perdido', f.mrr_perdido,
    'taxa_retencao', 100 - f.taxa_cancelamento,
    'taxa_cancelamento', f.taxa_cancelamento,
    'taxa_crescimento', 0,
    'health_score', f.health_score,
    'health_status', f.health_status,
    'cursos', f.cursos
  ) ORDER BY f.carteira_alunos DESC, f.professor_nome), '[]'::jsonb)
  INTO v_kpis
  FROM finais f;

  WITH k AS (
    SELECT x
    FROM jsonb_array_elements(v_kpis) x
  )
  SELECT COALESCE(v_result->'totais', '{}'::jsonb) || jsonb_build_object(
    'total_professores', COUNT(*),
    'total_alunos', COALESCE(SUM((x->>'carteira_alunos')::integer), 0),
    'media_alunos_professor', COALESCE(ROUND(AVG((x->>'carteira_alunos')::numeric), 1), 0),
    'media_alunos_turma', CASE WHEN SUM((x->>'turmas_elegiveis_media')::integer) > 0
      THEN ROUND(
        SUM((x->>'alunos_via_turmas')::integer)::numeric
        / SUM((x->>'turmas_elegiveis_media')::integer),
        2
      ) ELSE 0 END,
    'media_presenca', COALESCE(ROUND(AVG((x->>'media_presenca')::numeric), 1), 0),
    'taxa_conversao_media', COALESCE(ROUND(AVG((x->>'taxa_conversao')::numeric), 1), 0),
    'taxa_renovacao_media', COALESCE(ROUND(AVG((x->>'taxa_renovacao')::numeric), 1), 0),
    'total_evasoes', COALESCE(SUM((x->>'evasoes')::integer), 0),
    'total_matriculas', COALESCE(SUM((x->>'matriculas')::integer), 0),
    'mrr_total', COALESCE(SUM((x->>'mrr_carteira')::numeric), 0)
  )
  INTO v_totais
  FROM k;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professor', x->>'professor_nome',
    'alunos', (x->>'carteira_alunos')::integer
  ) ORDER BY (x->>'carteira_alunos')::integer DESC), '[]'::jsonb)
  INTO v_top_carteira
  FROM (
    SELECT x FROM jsonb_array_elements(v_kpis) x
    ORDER BY (x->>'carteira_alunos')::integer DESC LIMIT 5
  ) ranked;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professor', x->>'professor_nome',
    'media', (x->>'media_alunos_turma')::numeric
  ) ORDER BY (x->>'media_alunos_turma')::numeric DESC), '[]'::jsonb)
  INTO v_top_media
  FROM (
    SELECT x FROM jsonb_array_elements(v_kpis) x
    WHERE (x->>'turmas_elegiveis_media')::integer > 0
    ORDER BY (x->>'media_alunos_turma')::numeric DESC LIMIT 5
  ) ranked;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'professor', x->>'professor_nome',
    'presenca', (x->>'media_presenca')::numeric
  ) ORDER BY (x->>'media_presenca')::numeric DESC), '[]'::jsonb)
  INTO v_top_presenca
  FROM (
    SELECT x FROM jsonb_array_elements(v_kpis) x
    ORDER BY (x->>'media_presenca')::numeric DESC LIMIT 5
  ) ranked;

  v_result := jsonb_set(v_result, '{kpis_professores}', v_kpis, true);
  v_result := jsonb_set(v_result, '{totais}', v_totais, true);
  v_result := jsonb_set(v_result, '{top_carteira}', v_top_carteira, true);
  v_result := jsonb_set(v_result, '{top_media_turma}', v_top_media, true);
  v_result := jsonb_set(v_result, '{top_presenca}', v_top_presenca, true);
  v_result := jsonb_set(
    v_result,
    '{fonte_kpis_professores}',
    to_jsonb('get_kpis_professor_periodo_canonico'::text),
    true
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_dados_relatorio_coordenacao(uuid, integer, integer)
IS 'Relatorio da coordenacao com KPIs e rankings derivados da fonte canonica mensal de professores.';

GRANT EXECUTE ON FUNCTION public.get_dados_relatorio_coordenacao(uuid, integer, integer)
TO authenticated, service_role;
