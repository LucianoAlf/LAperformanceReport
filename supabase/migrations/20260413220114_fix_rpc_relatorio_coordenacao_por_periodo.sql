-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION get_dados_relatorio_coordenacao(
  p_unidade_id UUID,
  p_ano INTEGER,
  p_mes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB := '{}'::jsonb;
  v_unidade_nome TEXT;
  v_inicio DATE;
  v_fim DATE;
  v_inicio_ant DATE;
  v_fim_ant DATE;
  v_inicio_ano_ant DATE;
  v_fim_ano_ant DATE;
BEGIN
  -- Calcular range de datas do periodo
  v_inicio := make_date(p_ano, p_mes, 1);
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  -- Mes anterior
  v_inicio_ant := (v_inicio - interval '1 month')::date;
  v_fim_ant := (v_inicio - interval '1 day')::date;

  -- Mesmo mes ano anterior
  v_inicio_ano_ant := make_date(p_ano - 1, p_mes, 1);
  v_fim_ano_ant := (v_inicio_ano_ant + interval '1 month' - interval '1 day')::date;

  -- Buscar nome da unidade
  IF p_unidade_id IS NOT NULL THEN
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = p_unidade_id;
  ELSE
    v_unidade_nome := 'Consolidado';
  END IF;

  -- Periodo
  v_result := v_result || jsonb_build_object('periodo', jsonb_build_object(
    'unidade_id', p_unidade_id,
    'unidade_nome', v_unidade_nome,
    'ano', p_ano,
    'mes', p_mes,
    'coordenadores', ARRAY['Quintela', 'Juliana']
  ));

  -- KPIs consolidados dos professores (agrupados por professor)
  v_result := v_result || jsonb_build_object('kpis_professores', (
    WITH
      carteira AS (
        SELECT a.professor_atual_id AS professor_id, a.unidade_id,
          COUNT(*) AS carteira_alunos,
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
        SELECT ae.professor_id, ae.unidade_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio AND v_fim
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id, ae.unidade_id
      ),
      turmas_calc AS (
        SELECT ae.professor_id, ae.unidade_id,
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
        SELECT l.professor_experimental_id AS professor_id, l.unidade_id,
          SUM(CASE WHEN l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END) AS experimentais,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') AND l.experimental_realizada THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas_pos_exp,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id, l.unidade_id
      ),
      renovacoes AS (
        SELECT COALESCE(m.professor_id, a.professor_atual_id) AS professor_id, m.unidade_id,
          COUNT(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
          COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
          COUNT(*) FILTER (WHERE m.tipo IN ('renovacao','nao_renovacao')) AS total_contratos
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE COALESCE(m.professor_id, a.professor_atual_id) IS NOT NULL
          AND m.tipo IN ('renovacao','nao_renovacao')
          AND m.data BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY COALESCE(m.professor_id, a.professor_atual_id), m.unidade_id
      ),
      evasoes AS (
        SELECT m.professor_id, m.unidade_id,
          COUNT(*) AS evasoes,
          SUM(COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior, 0)) AS mrr_perdido
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio AND v_fim
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id, m.unidade_id
      ),
      kpis_por_unidade AS (
        SELECT
          p.id AS professor_id,
          p.nome AS professor_nome,
          COALESCE(c.unidade_id, pr.unidade_id, e.unidade_id, r.unidade_id, ev.unidade_id) AS unidade_id,
          COALESCE(c.carteira_alunos, 0)::integer AS carteira_alunos,
          COALESCE(pr.media_presenca, 0)::numeric(5,2) AS media_presenca,
          COALESCE(tc.media_alunos_turma, 0)::numeric(5,2) AS media_alunos_turma,
          COALESCE(p.nps_medio, 0)::numeric(5,2) AS nps_medio,
          COALESCE(e.experimentais, 0)::integer AS experimentais,
          COALESCE(e.matriculas, 0)::integer AS matriculas,
          COALESCE(e.matriculas_pos_exp, 0)::integer AS matriculas_pos_exp,
          CASE WHEN COALESCE(e.experimentais,0) > 0
            THEN ROUND(COALESCE(e.matriculas_pos_exp,0)::numeric / e.experimentais * 100, 2) ELSE 0 END AS taxa_conversao,
          COALESCE(r.renovacoes, 0)::integer AS renovacoes,
          COALESCE(r.nao_renovacoes, 0)::integer AS nao_renovacoes,
          CASE WHEN COALESCE(r.total_contratos,0) > 0
            THEN ROUND(r.renovacoes::numeric / r.total_contratos * 100, 2) ELSE 0 END AS taxa_renovacao,
          COALESCE(ev.evasoes, 0)::integer AS evasoes,
          COALESCE(c.mrr_carteira, 0)::numeric(12,2) AS mrr_carteira,
          COALESCE(ev.mrr_perdido, 0)::numeric(12,2) AS mrr_perdido,
          CASE WHEN COALESCE(c.carteira_alunos,0) > 0
            THEN ROUND((COALESCE(c.carteira_alunos,0) - COALESCE(ev.evasoes,0))::numeric / c.carteira_alunos * 100, 2) ELSE 100 END AS taxa_retencao,
          0::numeric AS taxa_crescimento
        FROM professores p
        LEFT JOIN carteira c ON c.professor_id = p.id
        LEFT JOIN presenca pr ON pr.professor_id = p.id AND pr.unidade_id = c.unidade_id
        LEFT JOIN turmas_calc tc ON tc.professor_id = p.id AND tc.unidade_id = c.unidade_id
        LEFT JOIN experimentais e ON e.professor_id = p.id AND e.unidade_id = c.unidade_id
        LEFT JOIN renovacoes r ON r.professor_id = p.id AND r.unidade_id = c.unidade_id
        LEFT JOIN evasoes ev ON ev.professor_id = p.id AND ev.unidade_id = c.unidade_id
        WHERE p.ativo = true
          AND (c.professor_id IS NOT NULL OR pr.professor_id IS NOT NULL
               OR e.professor_id IS NOT NULL OR r.professor_id IS NOT NULL OR ev.professor_id IS NOT NULL)
      ),
      kpis_consolidados AS (
        SELECT
          professor_id,
          professor_nome,
          SUM(carteira_alunos) AS carteira_alunos,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND(SUM(media_presenca * carteira_alunos) / SUM(carteira_alunos), 2)
            ELSE 0 END AS media_presenca,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND(SUM(media_alunos_turma * carteira_alunos) / SUM(carteira_alunos), 2)
            ELSE 0 END AS media_alunos_turma,
          MAX(nps_medio) AS nps_medio,
          SUM(experimentais) AS experimentais,
          SUM(matriculas) AS matriculas,
          SUM(matriculas_pos_exp) AS matriculas_pos_exp,
          CASE WHEN SUM(experimentais) > 0
            THEN ROUND(SUM(matriculas_pos_exp)::numeric / SUM(experimentais) * 100, 2) ELSE 0 END AS taxa_conversao,
          SUM(renovacoes) AS renovacoes,
          SUM(nao_renovacoes) AS nao_renovacoes,
          CASE WHEN SUM(renovacoes) + SUM(nao_renovacoes) > 0
            THEN ROUND(SUM(renovacoes)::numeric / (SUM(renovacoes) + SUM(nao_renovacoes)) * 100, 2) ELSE 0 END AS taxa_renovacao,
          SUM(evasoes) AS evasoes,
          SUM(mrr_carteira) AS mrr_carteira,
          SUM(mrr_perdido) AS mrr_perdido,
          CASE WHEN SUM(carteira_alunos) > 0
            THEN ROUND((SUM(carteira_alunos) - SUM(evasoes))::numeric / SUM(carteira_alunos) * 100, 2) ELSE 100 END AS taxa_retencao,
          0::numeric AS taxa_crescimento,
          (SELECT COALESCE(array_agg(DISTINCT c.nome), ARRAY[]::text[])
           FROM professores_cursos pc
           JOIN cursos c ON c.id = pc.curso_id
           WHERE pc.professor_id = kpis_por_unidade.professor_id) AS cursos
        FROM kpis_por_unidade
        GROUP BY professor_id, professor_nome
      )
    SELECT COALESCE(jsonb_agg(row_to_json(k) ORDER BY k.carteira_alunos DESC), '[]'::jsonb)
    FROM kpis_consolidados k
  ));

  -- Totais consolidados (do kpis_professores ja consolidado)
  v_result := v_result || jsonb_build_object('totais', (
    SELECT row_to_json(t)
    FROM (
      SELECT
        jsonb_array_length(v_result->'kpis_professores') AS total_professores,
        (SELECT SUM((p->>'carteira_alunos')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_alunos,
        (SELECT ROUND(AVG((p->>'carteira_alunos')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_alunos_professor,
        (SELECT ROUND(AVG(NULLIF((p->>'media_alunos_turma')::numeric, 0)), 2) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_alunos_turma,
        (SELECT ROUND(AVG((p->>'media_presenca')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS media_presenca,
        (SELECT ROUND(AVG(NULLIF((p->>'nps_medio')::numeric, 0)), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS nps_medio,
        (SELECT ROUND(AVG((p->>'taxa_conversao')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS taxa_conversao_media,
        (SELECT ROUND(AVG((p->>'taxa_renovacao')::numeric), 1) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS taxa_renovacao_media,
        (SELECT SUM((p->>'evasoes')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_evasoes,
        (SELECT SUM((p->>'matriculas')::int) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS total_matriculas,
        (SELECT SUM((p->>'mrr_carteira')::numeric) FROM jsonb_array_elements(v_result->'kpis_professores') p) AS mrr_total
    ) t
  ));

  -- Top 5 por carteira
  v_result := v_result || jsonb_build_object('top_carteira', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'alunos', (p->>'carteira_alunos')::int
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      ORDER BY (p->>'carteira_alunos')::int DESC LIMIT 5
    ) sub
  ));

  -- Top 5 por media turma
  v_result := v_result || jsonb_build_object('top_media_turma', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'media', (p->>'media_alunos_turma')::numeric
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'media_alunos_turma')::numeric > 0
      ORDER BY (p->>'media_alunos_turma')::numeric DESC LIMIT 5
    ) sub
  ));

  -- Top 5 por presenca
  v_result := v_result || jsonb_build_object('top_presenca', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'presenca', (p->>'media_presenca')::numeric
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      ORDER BY (p->>'media_presenca')::numeric DESC LIMIT 5
    ) sub
  ));

  -- Top 5 matriculadores
  v_result := v_result || jsonb_build_object('top_matriculadores', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor', p->>'professor_nome',
      'matriculas', (p->>'matriculas')::int
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'matriculas')::int > 0
      ORDER BY (p->>'matriculas')::int DESC LIMIT 5
    ) sub
  ));

  -- Top 5 retencao
  v_result := v_result || jsonb_build_object('top_retencao', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        p.nome AS professor,
        ROUND(AVG(a.tempo_permanencia_meses), 1) AS tempo_medio
      FROM alunos a
      JOIN professores p ON a.professor_atual_id = p.id
      WHERE a.data_matricula <= v_fim
        AND (a.data_saida IS NULL OR a.data_saida >= v_inicio)
        AND a.status != 'lead'
        AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
      GROUP BY p.id, p.nome
      HAVING COUNT(*) >= 3
      ORDER BY AVG(a.tempo_permanencia_meses) DESC
      LIMIT 5
    ) t
  ));

  -- Professores em alerta
  v_result := v_result || jsonb_build_object('professores_alerta', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professor_id', (p->>'professor_id')::int,
      'professor', p->>'professor_nome',
      'presenca', (p->>'media_presenca')::numeric,
      'evasoes', (p->>'evasoes')::int,
      'alunos', (p->>'carteira_alunos')::int,
      'status', CASE
        WHEN (p->>'media_presenca')::numeric < 70 OR (p->>'evasoes')::int > 2 THEN 'critico'
        WHEN (p->>'media_presenca')::numeric < 80 OR (p->>'evasoes')::int > 0 THEN 'atencao'
        ELSE 'ok'
      END
    )), '[]'::jsonb)
    FROM (
      SELECT p FROM jsonb_array_elements(v_result->'kpis_professores') p
      WHERE (p->>'media_presenca')::numeric < 80 OR (p->>'evasoes')::int > 0
      ORDER BY (p->>'media_presenca')::numeric ASC
    ) sub
  ));

  -- Agenda (sem mudanca)
  v_result := v_result || jsonb_build_object('agenda', (
    SELECT row_to_json(a)
    FROM (
      SELECT
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'treinamento'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS treinamentos_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'reuniao'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS reunioes_agendadas,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.tipo = 'checkpoint'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS checkpoints_agendados,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.status = 'concluido'
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)
           AND EXTRACT(YEAR FROM pa.data_agendada) = p_ano
           AND EXTRACT(MONTH FROM pa.data_agendada) = p_mes) AS concluidos,
        (SELECT COUNT(*) FROM professor_acoes pa
         WHERE pa.status = 'pendente'
           AND pa.data_agendada < CURRENT_DATE
           AND (p_unidade_id IS NULL OR pa.unidade_id = p_unidade_id)) AS atrasados
    ) a
  ));

  -- Catalogo treinamentos (sem mudanca)
  v_result := v_result || jsonb_build_object('catalogo_treinamentos', (
    SELECT COALESCE(jsonb_agg(row_to_json(ct)), '[]'::jsonb)
    FROM (
      SELECT id, nome, descricao
      FROM catalogo_treinamentos
      WHERE ativo = true
      ORDER BY nome
    ) ct
  ));

  -- Metas professores (sem mudanca)
  v_result := v_result || jsonb_build_object('metas_professores', (
    SELECT COALESCE(jsonb_object_agg(mk.tipo, mk.valor), '{}'::jsonb)
    FROM metas_kpi mk
    WHERE mk.ano = p_ano AND mk.mes = p_mes
      AND (p_unidade_id IS NULL OR mk.unidade_id = p_unidade_id)
      AND mk.tipo IN ('media_alunos_turma', 'media_alunos_professor', 'taxa_renovacao_prof',
                      'nps_medio', 'presenca_media', 'taxa_conversao_exp', 'melhor_retencao')
  ));

  -- Comparativo mes anterior
  v_result := v_result || jsonb_build_object('mes_anterior', (
    WITH
      cart_ant AS (
        SELECT a.professor_atual_id AS professor_id, COUNT(*) AS carteira_alunos
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim_ant
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio_ant)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id
      ),
      pres_ant AS (
        SELECT ae.professor_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio_ant AND v_fim_ant
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id
      ),
      exp_ant AS (
        SELECT l.professor_experimental_id AS professor_id,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio_ant AND v_fim_ant
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id
      ),
      ev_ant AS (
        SELECT m.professor_id, COUNT(*) AS evasoes
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio_ant AND v_fim_ant
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id
      ),
      profs_ant AS (
        SELECT DISTINCT COALESCE(c.professor_id, p.professor_id, e.professor_id, ev.professor_id) AS pid
        FROM cart_ant c
        FULL OUTER JOIN pres_ant p ON p.professor_id = c.professor_id
        FULL OUTER JOIN exp_ant e ON e.professor_id = c.professor_id
        FULL OUTER JOIN ev_ant ev ON ev.professor_id = c.professor_id
      )
    SELECT row_to_json(t)
    FROM (
      SELECT
        COUNT(*) AS total_professores,
        SUM(COALESCE(c.carteira_alunos, 0)) AS total_alunos,
        ROUND(AVG(COALESCE(p.media_presenca, 0)), 1) AS media_presenca,
        SUM(COALESCE(ev.evasoes, 0)) AS total_evasoes,
        SUM(COALESCE(e.matriculas, 0)) AS total_matriculas
      FROM profs_ant pa
      LEFT JOIN cart_ant c ON c.professor_id = pa.pid
      LEFT JOIN pres_ant p ON p.professor_id = pa.pid
      LEFT JOIN exp_ant e ON e.professor_id = pa.pid
      LEFT JOIN ev_ant ev ON ev.professor_id = pa.pid
    ) t
  ));

  -- Comparativo mesmo mes ano anterior
  v_result := v_result || jsonb_build_object('ano_anterior', (
    WITH
      cart_aa AS (
        SELECT a.professor_atual_id AS professor_id, COUNT(*) AS carteira_alunos
        FROM alunos a
        WHERE a.professor_atual_id IS NOT NULL
          AND a.data_matricula <= v_fim_ano_ant
          AND (a.data_saida IS NULL OR a.data_saida >= v_inicio_ano_ant)
          AND a.status != 'lead'
          AND (p_unidade_id IS NULL OR a.unidade_id = p_unidade_id)
        GROUP BY a.professor_atual_id
      ),
      pres_aa AS (
        SELECT ae.professor_id,
          ROUND(COUNT(*) FILTER (WHERE ap.status = 'presente')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) AS media_presenca
        FROM aulas_emusys ae
        JOIN aluno_presenca ap ON ap.aula_emusys_id = ae.id
        WHERE ae.data_aula BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND ae.cancelada = false
          AND (p_unidade_id IS NULL OR ae.unidade_id = p_unidade_id)
        GROUP BY ae.professor_id
      ),
      exp_aa AS (
        SELECT l.professor_experimental_id AS professor_id,
          SUM(CASE WHEN l.status IN ('matriculado','convertido') THEN COALESCE(l.quantidade,1) ELSE 0 END) AS matriculas
        FROM leads l
        WHERE l.professor_experimental_id IS NOT NULL
          AND l.data_contato BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND (p_unidade_id IS NULL OR l.unidade_id = p_unidade_id)
        GROUP BY l.professor_experimental_id
      ),
      ev_aa AS (
        SELECT m.professor_id, COUNT(*) AS evasoes
        FROM movimentacoes_admin m
        LEFT JOIN alunos a ON a.id = m.aluno_id
        WHERE m.professor_id IS NOT NULL
          AND m.tipo IN ('evasao','nao_renovacao')
          AND (a.is_segundo_curso IS NULL OR a.is_segundo_curso = false OR a.id IS NULL)
          AND m.data BETWEEN v_inicio_ano_ant AND v_fim_ano_ant
          AND (p_unidade_id IS NULL OR m.unidade_id = p_unidade_id)
        GROUP BY m.professor_id
      ),
      profs_aa AS (
        SELECT DISTINCT COALESCE(c.professor_id, p.professor_id, e.professor_id, ev.professor_id) AS pid
        FROM cart_aa c
        FULL OUTER JOIN pres_aa p ON p.professor_id = c.professor_id
        FULL OUTER JOIN exp_aa e ON e.professor_id = c.professor_id
        FULL OUTER JOIN ev_aa ev ON ev.professor_id = c.professor_id
      )
    SELECT row_to_json(t)
    FROM (
      SELECT
        COUNT(*) AS total_professores,
        SUM(COALESCE(c.carteira_alunos, 0)) AS total_alunos,
        ROUND(AVG(COALESCE(p.media_presenca, 0)), 1) AS media_presenca,
        SUM(COALESCE(ev.evasoes, 0)) AS total_evasoes,
        SUM(COALESCE(e.matriculas, 0)) AS total_matriculas
      FROM profs_aa pa
      LEFT JOIN cart_aa c ON c.professor_id = pa.pid
      LEFT JOIN pres_aa p ON p.professor_id = pa.pid
      LEFT JOIN exp_aa e ON e.professor_id = pa.pid
      LEFT JOIN ev_aa ev ON ev.professor_id = pa.pid
    ) t
  ));

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_dados_relatorio_coordenacao IS 'Funcao para buscar dados do relatorio de coordenacao pedagogica com IA - V2: consulta tabelas base por periodo em vez de vw_kpis_professor_mensal';
