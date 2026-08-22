-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =============================================================
-- FIX: matriculas_pos_exp conta leads convertidos com experimental agendada
-- mesmo que experimental_realizada não tenha sido marcada pelo sync
-- Afeta: get_kpis_professor_periodo, get_kpis_experimentais_professor,
--        vw_kpis_professor_mensal, get_dados_relatorio_coordenacao
-- =============================================================

-- 1. get_kpis_professor_periodo
DROP FUNCTION IF EXISTS get_kpis_professor_periodo(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_kpis_professor_periodo(
  p_unidade_id UUID DEFAULT NULL,
  p_ano INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer,
  p_mes INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::integer
)
RETURNS TABLE (
  professor_id INTEGER,
  professor_nome VARCHAR(100),
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
        SUM(CASE WHEN l.status IN ('matriculado','convertido')
          AND (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
          THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas_pos_exp,
        SUM(CASE WHEN l.status IN ('matriculado','convertido')
          AND NOT (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
          THEN COALESCE(l.quantidade,1) ELSE 0 END)::integer AS matriculas_diretas,
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
    COALESCE(c.carteira_alunos, 0)::integer,
    COALESCE(c.ticket_medio, 0)::numeric(10,2),
    COALESCE(pr.media_presenca, 0)::numeric(5,2),
    COALESCE(100 - pr.media_presenca, 0)::numeric(5,2),
    COALESCE(c.mrr_carteira, 0)::numeric(12,2),
    COALESCE(p.nps_medio, 0)::numeric(5,2),
    COALESCE(tc.media_alunos_turma, 0)::numeric(5,2),
    COALESCE(e.experimentais, 0)::integer,
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
      THEN ROUND(COALESCE(ev.evasoes,0)::numeric / c.carteira_alunos * 100, 2) ELSE 0 END::numeric(5,2)
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

-- 2. get_kpis_experimentais_professor (mesma correção no filtro)
CREATE OR REPLACE FUNCTION get_kpis_experimentais_professor(
  p_ano INTEGER,
  p_mes INTEGER,
  p_unidade_id UUID DEFAULT NULL
)
RETURNS TABLE (
  professor_id INTEGER,
  unidade_id UUID,
  experimentais INTEGER,
  matriculas INTEGER,
  matriculas_pos_exp INTEGER,
  matriculas_diretas INTEGER,
  taxa_conversao NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    l.professor_experimental_id AS professor_id,
    l.unidade_id,
    SUM(CASE WHEN l.experimental_realizada = true
      THEN COALESCE(l.quantidade, 1) ELSE 0
    END)::integer AS experimentais,
    SUM(CASE WHEN l.status IN ('matriculado', 'convertido')
      THEN COALESCE(l.quantidade, 1) ELSE 0
    END)::integer AS matriculas,
    SUM(CASE WHEN l.status IN ('matriculado', 'convertido')
      AND (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
      THEN COALESCE(l.quantidade, 1) ELSE 0
    END)::integer AS matriculas_pos_exp,
    SUM(CASE WHEN l.status IN ('matriculado', 'convertido')
      AND NOT (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
      THEN COALESCE(l.quantidade, 1) ELSE 0
    END)::integer AS matriculas_diretas,
    CASE
      WHEN SUM(CASE WHEN l.experimental_realizada = true
                THEN COALESCE(l.quantidade, 1) ELSE 0 END) > 0
      THEN ROUND(
        SUM(CASE WHEN l.status IN ('matriculado', 'convertido')
          AND (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
                 THEN COALESCE(l.quantidade, 1) ELSE 0 END)::numeric
        / SUM(CASE WHEN l.experimental_realizada = true
                   THEN COALESCE(l.quantidade, 1) ELSE 0 END)::numeric
        * 100, 2)
      ELSE 0
    END AS taxa_conversao
  FROM leads l
  WHERE l.professor_experimental_id IS NOT NULL
    AND EXTRACT(YEAR  FROM l.data_contato)::integer = p_ano
    AND EXTRACT(MONTH FROM l.data_contato)::integer = p_mes
    AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
  GROUP BY l.professor_experimental_id, l.unidade_id;
$$;

-- 3. vw_kpis_professor_mensal (recriar view com filtro corrigido)
CREATE OR REPLACE VIEW vw_kpis_professor_mensal AS
WITH carteira AS (
  SELECT a.professor_atual_id AS professor_id,
    a.unidade_id,
    count(*) AS carteira_alunos,
    CASE WHEN count(*) FILTER (WHERE a.valor_parcela > 0) > 0
      THEN sum(a.valor_parcela) / count(*) FILTER (WHERE a.valor_parcela > 0)
      ELSE 0 END AS ticket_medio,
    avg(a.percentual_presenca) AS media_presenca,
    sum(CASE WHEN a.valor_parcela > 0 THEN a.valor_parcela ELSE 0 END) AS mrr_carteira
  FROM alunos a
  WHERE a.status = 'ativo' AND a.professor_atual_id IS NOT NULL
  GROUP BY a.professor_atual_id, a.unidade_id
), turmas_calc AS (
  SELECT vt.professor_id, vt.unidade_id,
    count(*) AS total_turmas,
    round(avg(vt.total_alunos), 2) AS media_alunos_turma
  FROM vw_turmas_implicitas vt
  GROUP BY vt.professor_id, vt.unidade_id
), experimentais_atual AS (
  SELECT l.professor_experimental_id AS professor_id, l.unidade_id,
    sum(CASE WHEN l.experimental_realizada = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais,
    sum(CASE WHEN l.status IN ('matriculado','convertido')
      AND (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
      THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS matriculas_pos_exp,
    sum(CASE WHEN l.status IN ('matriculado','convertido')
      AND NOT (l.experimental_realizada = true OR (l.converteu = true AND l.data_experimental IS NOT NULL AND l.faltou_experimental IS NOT TRUE))
      THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS matriculas_diretas,
    sum(CASE WHEN l.status IN ('matriculado','convertido')
      THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS matriculas
  FROM leads l
  WHERE l.professor_experimental_id IS NOT NULL
    AND EXTRACT(year FROM l.data_contato) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM l.data_contato) = EXTRACT(month FROM CURRENT_DATE)
  GROUP BY l.professor_experimental_id, l.unidade_id
), renovacoes_atual AS (
  SELECT COALESCE(m.professor_id, a.professor_atual_id) AS professor_id, m.unidade_id,
    count(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
    count(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
    count(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos
  FROM movimentacoes_admin m
  LEFT JOIN alunos a ON a.id = m.aluno_id
  WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
    AND m.tipo IN ('renovacao','nao_renovacao')
    AND EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)
  GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
), evasoes_atual AS (
  SELECT m.professor_id, m.unidade_id,
    count(*) AS evasoes,
    sum(CASE WHEN COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) > 0
      THEN COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) ELSE 0 END) AS mrr_perdido
  FROM movimentacoes_admin m
  LEFT JOIN alunos a ON a.id = m.aluno_id
  WHERE m.professor_id IS NOT NULL
    AND m.tipo IN ('evasao','nao_renovacao')
    AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
    AND EXTRACT(year FROM m.data) = EXTRACT(year FROM CURRENT_DATE)
    AND EXTRACT(month FROM m.data) = EXTRACT(month FROM CURRENT_DATE)
  GROUP BY m.professor_id, m.unidade_id
)
SELECT DISTINCT ON (p.id, COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id))
  p.id AS professor_id,
  p.nome AS professor_nome,
  COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id) AS unidade_id,
  EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
  EXTRACT(month FROM CURRENT_DATE)::integer AS mes,
  COALESCE(c.carteira_alunos, 0)::integer AS carteira_alunos,
  COALESCE(c.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(c.media_presenca, 0)::numeric(5,2) AS media_presenca,
  COALESCE(100 - c.media_presenca, 0)::numeric(5,2) AS taxa_faltas,
  COALESCE(c.mrr_carteira, 0)::numeric(12,2) AS mrr_carteira,
  COALESCE(p.nps_medio, 0)::numeric(5,2) AS nps_medio,
  COALESCE(tc.media_alunos_turma, 0)::numeric(5,2) AS media_alunos_turma,
  COALESCE(ea.experimentais, 0)::integer AS experimentais,
  COALESCE(ea.matriculas, 0)::integer AS matriculas,
  COALESCE(ea.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
  COALESCE(ea.matriculas_diretas, 0)::integer AS matriculas_diretas,
  CASE WHEN COALESCE(ea.experimentais, 0) > 0
    THEN round(COALESCE(ea.matriculas_pos_exp, 0)::numeric / ea.experimentais * 100, 2)
    ELSE 0 END AS taxa_conversao,
  COALESCE(ra.renovacoes, 0)::integer AS renovacoes,
  COALESCE(ra.nao_renovacoes, 0)::integer AS nao_renovacoes,
  CASE WHEN COALESCE(ra.total_contratos, 0) > 0
    THEN round(ra.renovacoes::numeric / ra.total_contratos * 100, 2)
    ELSE 0 END AS taxa_renovacao,
  COALESCE(ev.evasoes, 0)::integer AS evasoes,
  COALESCE(ev.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
  CASE WHEN COALESCE(c.carteira_alunos, 0) > 0
    THEN round(COALESCE(ev.evasoes, 0)::numeric / c.carteira_alunos * 100, 2)
    ELSE 0 END AS taxa_cancelamento,
  0 AS ranking_matriculador,
  0 AS ranking_renovador,
  0 AS ranking_churn
FROM professores p
LEFT JOIN carteira c ON c.professor_id = p.id
LEFT JOIN turmas_calc tc ON tc.professor_id = p.id AND tc.unidade_id = c.unidade_id
LEFT JOIN experimentais_atual ea ON ea.professor_id = p.id AND ea.unidade_id = c.unidade_id
LEFT JOIN renovacoes_atual ra ON ra.professor_id = p.id AND ra.unidade_id = c.unidade_id
LEFT JOIN evasoes_atual ev ON ev.professor_id = p.id AND ev.unidade_id = c.unidade_id
WHERE p.ativo = true
  AND COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id) IS NOT NULL
ORDER BY p.id, COALESCE(c.unidade_id, ea.unidade_id, ra.unidade_id, ev.unidade_id), c.carteira_alunos DESC NULLS LAST;
