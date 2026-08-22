-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION get_kpis_professor_periodo(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer,
  p_mes INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
  professor_id INTEGER,
  professor_nome TEXT,
  unidade_id UUID,
  ano INTEGER,
  mes INTEGER,
  carteira_alunos INTEGER,
  ticket_medio NUMERIC(10,2),
  media_presenca NUMERIC(5,2),
  taxa_faltas NUMERIC(5,2),
  mrr_carteira NUMERIC(12,2),
  nps_medio NUMERIC(5,2),
  media_alunos_turma NUMERIC(5,2),
  experimentais INTEGER,
  matriculas INTEGER,
  matriculas_pos_exp INTEGER,
  matriculas_diretas INTEGER,
  taxa_conversao NUMERIC(5,2),
  renovacoes INTEGER,
  nao_renovacoes INTEGER,
  taxa_renovacao NUMERIC(5,2),
  evasoes INTEGER,
  mrr_perdido NUMERIC(12,2),
  taxa_cancelamento NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inicio DATE;
  v_fim DATE;
BEGIN
  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  RETURN QUERY
  WITH
    carteira AS (
      SELECT a.professor_atual_id AS prof_id, a.unidade_id AS uid,
        COUNT(*)::integer AS carteira_alunos,
        CASE WHEN COUNT(*) FILTER (WHERE a.valor_parcela > 0) > 0
          THEN ROUND(SUM(a.valor_parcela) / COUNT(*) FILTER (WHERE a.valor_parcela > 0), 2) ELSE 0 END AS ticket_medio,
        SUM(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
      FROM alunos a
      WHERE a.professor_atual_id IS NOT NULL
        AND a.data_matricula <= v_fim
        AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
        AND a.status != 'lead'
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
        COUNT(DISTINCT ae.turma_nome) AS total_turmas,
        ROUND(COUNT(DISTINCT ap.aluno_id)::numeric / NULLIF(COUNT(DISTINCT ae.turma_nome), 0), 2) AS media_alunos_turma
      FROM aulas_emusys ae
      JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
      WHERE ae.data_aula BETWEEN v_inicio AND v_fim
        AND ae.cancelada = false
        AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
      GROUP BY ae.professor_id, ae.unidade_id
    ),
    experimentais AS (
      SELECT l.professor_experimental_id AS prof_id, l.unidade_id AS uid,
        SUM(CASE WHEN l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS experimentais,
        SUM(CASE WHEN l.status IN ('matriculado','convertido') AND l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas_pos_exp,
        SUM(CASE WHEN l.status IN ('matriculado','convertido') AND l.experimental_realizada IS NOT TRUE THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas_diretas,
        SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas
      FROM leads l
      WHERE l.professor_experimental_id IS NOT NULL
        AND l.data_contato BETWEEN v_inicio AND v_fim
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
      WHERE m.professor_id IS NOT NULL
        AND m.tipo IN ('evasao','nao_renovacao')
        AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
        AND m.data BETWEEN v_inicio AND v_fim
        AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
      GROUP BY m.professor_id, m.unidade_id
    )
  SELECT
    p.id AS professor_id,
    p.nome AS professor_nome,
    COALESCE(c.uid, pr.uid, e.uid, r.uid, ev.uid) AS unidade_id,
    p_ano AS ano,
    p_mes AS mes,
    COALESCE(c.carteira_alunos, 0)::integer AS carteira_alunos,
    COALESCE(c.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
    COALESCE(pr.media_presenca, 0)::numeric(5,2) AS media_presenca,
    COALESCE(100 - pr.media_presenca, 0)::numeric(5,2) AS taxa_faltas,
    COALESCE(c.mrr_carteira, 0)::numeric(12,2) AS mrr_carteira,
    COALESCE(p.nps_medio, 0)::numeric(5,2) AS nps_medio,
    COALESCE(tc.media_alunos_turma, 0)::numeric(5,2) AS media_alunos_turma,
    COALESCE(e.experimentais, 0)::integer AS experimentais,
    COALESCE(e.matriculas, 0)::integer AS matriculas,
    COALESCE(e.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
    COALESCE(e.matriculas_diretas, 0)::integer AS matriculas_diretas,
    CASE WHEN COALESCE(e.experimentais,0) > 0
      THEN ROUND(COALESCE(e.matriculas_pos_exp,0)::numeric / e.experimentais * 100, 2) ELSE 0 END::numeric(5,2) AS taxa_conversao,
    COALESCE(r.renovacoes, 0)::integer AS renovacoes,
    COALESCE(r.nao_renovacoes, 0)::integer AS nao_renovacoes,
    CASE WHEN COALESCE(r.total_contratos,0) > 0
      THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2) ELSE 0 END::numeric(5,2) AS taxa_renovacao,
    COALESCE(ev.evasoes, 0)::integer AS evasoes,
    COALESCE(ev.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
    CASE WHEN COALESCE(c.carteira_alunos,0) > 0
      THEN ROUND(COALESCE(ev.evasoes,0)::numeric / c.carteira_alunos * 100, 2) ELSE 0 END::numeric(5,2) AS taxa_cancelamento
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
$$;
