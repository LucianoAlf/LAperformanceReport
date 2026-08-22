-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adiciona total_turmas e alunos_via_turmas ao retorno da RPC get_kpis_professor_periodo.
-- Permite agregar Media/Turma por soma direta no consolidado (modo "Todas as unidades")
-- usando a mesma formula que o modal: alunos_distintos / turmas_distintas.
DROP FUNCTION IF EXISTS get_kpis_professor_periodo(integer, integer, uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_kpis_professor_periodo(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_data_inicio date DEFAULT NULL::date,
  p_data_fim date DEFAULT NULL::date
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
  alunos_via_turmas integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inicio DATE;
  v_fim DATE;
BEGIN
  v_inicio := COALESCE(p_data_inicio, make_date(p_ano, p_mes, 1));
  v_fim := COALESCE(p_data_fim, (v_inicio + interval '1 month' - interval '1 day')::date);

  RETURN QUERY
  WITH
    carteira AS (
      SELECT a.professor_atual_id AS prof_id, a.unidade_id AS uid,
        COUNT(*)::integer AS carteira_alunos,
        CASE WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0) > 0
          THEN ROUND(SUM(a.valor_parcela) / COUNT(*) FILTER (WHERE a.valor_parcela > 0), 2) ELSE 0 END AS ticket_medio,
        SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
      FROM alunos a
        JOIN cursos cur ON a.curso_id = cur.id
      WHERE a.professor_atual_id IS NOT NULL
        AND a.data_matricula <= v_fim
        AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
        AND a.status != 'lead'
        AND (cur.is_projeto_banda IS NULL OR cur.is_projeto_banda = false)
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY a.professor_atual_id, a.unidade_id
    ),
    presenca AS (
      SELECT ae.professor_id AS prof_id, ae.unidade_id AS uid,
        ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
      FROM aulas_emusys ae
      JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
      WHERE ae.data_aula BETWEEN v_inicio AND v_fim
        AND ae.cancelada = false
        AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
      GROUP BY ae.professor_id, ae.unidade_id
    ),
    turmas_calc AS (
      SELECT ae.professor_id AS prof_id, ae.unidade_id AS uid,
        COUNT(DISTINCT ae.turma_nome)::integer AS total_turmas,
        COUNT(DISTINCT ap.aluno_id)::integer AS alunos_via_turmas,
        ROUND(COUNT(DISTINCT ap.aluno_id)::numeric / NULLIF(COUNT(DISTINCT ae.turma_nome), 0), 2) AS media_alunos_turma
      FROM aulas_emusys ae
      JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
      WHERE ae.data_aula BETWEEN v_inicio AND v_fim
        AND ae.cancelada = false
        AND ae.curso_nome NOT ILIKE '%banda%'
        AND ae.curso_nome NOT ILIKE '%garage band%'
        AND ae.curso_nome NOT ILIKE '%power kids%'
        AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
      GROUP BY ae.professor_id, ae.unidade_id
    ),
    experimentais AS (
      SELECT l.professor_experimental_id AS prof_id, l.unidade_id AS uid,
        COUNT(*) FILTER (
          WHERE l.data_experimental BETWEEN v_inicio AND v_fim
        )::integer AS experimentais_agendadas,
        SUM(CASE
          WHEN l.data_experimental BETWEEN v_inicio AND v_fim
           AND l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0
        END)::integer AS experimentais,
        COUNT(*) FILTER (
          WHERE l.data_experimental BETWEEN v_inicio AND v_fim
            AND (l.faltou_experimental = true
                 OR ((l.status IN ('matriculado','convertido')) AND l.experimental_realizada = false))
        )::integer AS experimentais_faltas,
        SUM(CASE
          WHEN l.data_experimental BETWEEN v_inicio AND v_fim
           AND l.status IN ('matriculado','convertido')
           AND (l.experimental_realizada = true OR (l.converteu = true AND l.faltou_experimental IS NOT TRUE))
          THEN COALESCE(l.quantidade,1) ELSE 0
        END)::integer AS matriculas_pos_exp,
        SUM(CASE
          WHEN l.data_conversao BETWEEN v_inicio AND v_fim
           AND l.status IN ('matriculado','convertido')
           AND NOT (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
          THEN COALESCE(l.quantidade,1) ELSE 0
        END)::integer AS matriculas_diretas,
        SUM(CASE
          WHEN l.status IN ('matriculado','convertido')
           AND (
             (l.data_experimental BETWEEN v_inicio AND v_fim AND (l.experimental_realizada = true OR (l.converteu = true AND l.faltou_experimental IS NOT TRUE)))
             OR
             (l.data_conversao BETWEEN v_inicio AND v_fim AND NOT (l.experimental_realizada = true OR l.converteu = true))
           )
          THEN COALESCE(l.quantidade,1) ELSE 0
        END)::integer AS matriculas
      FROM leads l
      WHERE l.professor_experimental_id IS NOT NULL
        AND (
          l.data_experimental BETWEEN v_inicio AND v_fim
          OR l.data_conversao BETWEEN v_inicio AND v_fim
        )
        AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
      GROUP BY l.professor_experimental_id, l.unidade_id
    ),
    renovacoes AS (
      SELECT COALESCE(m.professor_id, a.professor_atual_id) AS prof_id, m.unidade_id AS uid,
        COUNT(*) FILTER (WHERE m.tipo = 'renovacao')::integer AS renovacoes,
        COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao')::integer AS nao_renovacoes,
        COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao'))::integer AS total_contratos
      FROM movimentacoes_admin m
      LEFT JOIN alunos a ON a.id = m.aluno_id
      WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
        AND m.tipo IN ('renovacao','nao_renovacao')
        AND m.data BETWEEN v_inicio AND v_fim
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
    ),
    evasoes AS (
      SELECT m.professor_id AS prof_id, m.unidade_id AS uid,
        COUNT(*)::integer AS evasoes,
        SUM(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)) AS mrr_perdido
      FROM movimentacoes_admin m
      LEFT JOIN alunos a ON a.id = m.aluno_id
      LEFT JOIN motivos_saida ms ON ms.id = COALESCE(
        m.motivo_saida_id,
        (SELECT ms2.id FROM motivos_saida ms2 WHERE ms2.nome ILIKE m.motivo AND ms2.ativo = true LIMIT 1)
      )
      WHERE m.professor_id IS NOT NULL
        AND m.tipo IN ('evasao','nao_renovacao')
        AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
        AND ms.conta_score_professor = true
        AND m.data BETWEEN v_inicio AND v_fim
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      GROUP BY m.professor_id, m.unidade_id
    )
  SELECT
    p.id AS professor_id,
    p.nome::text AS professor_nome,
    COALESCE(c.uid, pr.uid, e.uid, r.uid, ev.uid) AS unidade_id,
    p_ano AS ano,
    p_mes AS mes,
    COALESCE(c.carteira_alunos, 0)::integer,
    COALESCE(c.ticket_medio, 0)::numeric(10,2),
    COALESCE(pr.media_presenca, 0)::numeric(5,2),
    COALESCE(100 - pr.media_presenca, 0)::numeric(5,2),
    COALESCE(c.mrr_carteira, 0)::numeric(12,2),
    COALESCE(p.nps_medio, 0)::numeric(5,2),
    COALESCE(tc.media_alunos_turma, 0)::numeric(5,2),
    COALESCE(e.experimentais, 0)::integer,
    COALESCE(e.experimentais_agendadas, 0)::integer,
    COALESCE(e.experimentais_faltas, 0)::integer,
    COALESCE(e.matriculas, 0)::integer,
    COALESCE(e.matriculas_pos_exp, 0)::integer,
    COALESCE(e.matriculas_diretas, 0)::integer,
    CASE WHEN COALESCE(e.experimentais,0) > 0
      THEN ROUND(COALESCE(e.matriculas_pos_exp,0)::numeric / e.experimentais * 100, 2) ELSE 0 END::numeric(5,2),
    COALESCE(r.renovacoes, 0)::integer,
    COALESCE(r.nao_renovacoes, 0)::integer,
    CASE WHEN COALESCE(r.total_contratos,0) > 0
      THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2) ELSE 0 END::numeric(5,2),
    COALESCE(ev.evasoes, 0)::integer,
    COALESCE(ev.mrr_perdido, 0)::numeric(12,2),
    CASE WHEN COALESCE(c.carteira_alunos,0) > 0
      THEN ROUND(COALESCE(ev.evasoes,0)::numeric / c.carteira_alunos * 100, 2) ELSE 0 END::numeric(5,2),
    COALESCE(tc.total_turmas, 0)::integer,
    COALESCE(tc.alunos_via_turmas, 0)::integer
  FROM professores p
  LEFT JOIN carteira c ON c.prof_id = p.id
  LEFT JOIN presenca pr ON pr.prof_id = p.id AND pr.uid = c.uid
  LEFT JOIN turmas_calc tc ON tc.prof_id = p.id AND tc.uid = c.uid
  LEFT JOIN experimentais e ON e.prof_id = p.id AND e.uid = c.uid
  LEFT JOIN renovacoes r ON r.prof_id = p.id AND r.uid = c.uid
  LEFT JOIN evasoes ev ON ev.prof_id = p.id AND ev.uid = c.uid
  WHERE p.ativo = true
    AND (c.prof_id IS NOT NULL OR pr.prof_id IS NOT NULL
         OR e.prof_id IS NOT NULL OR r.prof_id IS NOT NULL OR ev.prof_id IS NOT NULL)
  ORDER BY p.id, COALESCE(c.uid, pr.uid, e.uid, r.uid, ev.uid);
END;
$function$;
