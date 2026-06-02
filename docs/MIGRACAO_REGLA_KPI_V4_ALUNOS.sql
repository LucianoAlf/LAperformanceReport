-- =============================================================================
-- MIGRACAO_REGLA_KPI_V4_ALUNOS.sql
-- Parte 1/2: KPIs de ALUNOS E MATRÍCULAS (snapshot operacional)
--
-- Correções aplicadas:
--   • alunos_ativos = COUNT(DISTINCT nome) pessoa-level (não filtra segundo curso)
--   • alunos_pagantes = COUNT(DISTINCT nome) com conta_como_pagante=true
--   • matriculas_ativas = COUNT(*) linha-level
--   • matriculas_banda = linhas com is_projeto_banda=true
--   • matriculas_2_curso = is_segundo_curso=true E NÃO é banda
--   • evasoes = deduplicadas por nome no mês (evasao + nao_renovacao)
--   • churn_rate = evasoes / pagantes * 100
--   • novas_matriculas = snapshot operacional (linhas novas no mês,
--     excluindo banda/coral/bolsista, filtrando status ativo/trancado)
--
-- NÃO inclui: ticket_medio, MRR, faturamento, inadimplencia, renovação, reajuste.
-- Esses ficam na Parte 2 (financeiro), pendente validação nominal.
--
-- NÃO EXECUTAR EM PRODUÇÃO SEM APROVAÇÃO DO ALFREDO/ALF
-- =============================================================================

-- =============================================================================
-- 1. VIEW: vw_kpis_gestao_mensal (snapshot vivo / mês corrente)
-- =============================================================================

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH fim_mes_atual AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
),

snapshot_base AS (
  SELECT
    a.unidade_id,
    a.id AS aluno_id,
    a.nome,
    a.status,
    a.data_matricula,
    a.data_saida,
    a.valor_parcela,
    a.is_segundo_curso,
    a.tipo_matricula_id,
    a.curso_id,
    tm.codigo AS tipo_matricula_codigo,
    tm.conta_como_pagante,
    c.is_projeto_banda,
    c.nome AS curso_nome
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN fim_mes_atual fm
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= fm.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > fm.fim_mes)
),

matriculas_mes AS (
  SELECT
    a.unidade_id,
    EXTRACT(year FROM a.data_matricula)::integer AS ano,
    EXTRACT(month FROM a.data_matricula)::integer AS mes,
    COUNT(*) AS novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN fim_mes_atual fm
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula >= fm.inicio_mes
    AND a.data_matricula <= fm.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > fm.fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = false
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
  GROUP BY a.unidade_id,
    EXTRACT(year FROM a.data_matricula),
    EXTRACT(month FROM a.data_matricula)
),

alunos_mes AS (
  SELECT
    sb.unidade_id,
    EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
    EXTRACT(month FROM CURRENT_DATE)::integer AS mes,

    -- Ativos: pessoas distintas no snapshot (pessoa-level, não filtra segundo curso)
    COUNT(DISTINCT sb.nome) AS total_alunos,

    -- Pagantes: pessoas distintas com pelo menos 1 linha pagante
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true)
      AS alunos_pagantes,

    -- Bolsistas integrais
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_INT')
      AS bolsistas_integrais,

    -- Bolsistas parciais
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_PARC')
      AS bolsistas_parciais,

    -- Matrículas ativas: todas as linhas no snapshot
    COUNT(*) AS matriculas_ativas,

    -- Banda/projeto: linhas
    COUNT(*) FILTER (WHERE sb.is_projeto_banda = true) AS total_banda,

    -- Segundo curso operacional: is_segundo_curso=true E NÃO é banda
    COUNT(*) FILTER (
      WHERE sb.is_segundo_curso = true
        AND COALESCE(sb.is_projeto_banda, false) = false
    ) AS segundo_curso

  FROM snapshot_base sb
  GROUP BY sb.unidade_id
),

evasoes_dedup AS (
  SELECT DISTINCT ON (
    LOWER(TRIM(BOTH FROM m.aluno_nome)),
    m.unidade_id,
    EXTRACT(year FROM m.data),
    EXTRACT(month FROM m.data)
  )
    m.id,
    m.aluno_id,
    m.unidade_id,
    m.data AS data_evasao
  FROM movimentacoes_admin m
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
  ORDER BY
    LOWER(TRIM(BOTH FROM m.aluno_nome)),
    m.unidade_id,
    EXTRACT(year FROM m.data),
    EXTRACT(month FROM m.data),
    m.aluno_id DESC NULLS LAST,
    m.data DESC
),

evasoes_mes AS (
  SELECT
    unidade_id,
    EXTRACT(year FROM data_evasao)::integer AS ano,
    EXTRACT(month FROM data_evasao)::integer AS mes,
    COUNT(*) AS total_evasoes
  FROM evasoes_dedup
  GROUP BY unidade_id,
    EXTRACT(year FROM data_evasao),
    EXTRACT(month FROM data_evasao)
)

SELECT
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  COALESCE(am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
  COALESCE(am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,

  -- KPIs pessoa-level
  COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
  COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
  COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
  COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,

  -- KPIs linha-level
  COALESCE(am.matriculas_ativas, 0)::integer AS matriculas_ativas,
  COALESCE(am.total_banda, 0)::integer AS total_banda,
  COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,

  -- Novas matrículas (snapshot operacional)
  COALESCE(mm.novas_matriculas, 0)::integer AS novas_matriculas,

  -- Evasões e churn
  COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
  CASE
    WHEN COALESCE(am.alunos_pagantes, 0) > 0
    THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
    ELSE 0
  END::numeric(5,2) AS churn_rate

FROM unidades u
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
  AND mm.ano = COALESCE(am.ano, EXTRACT(year FROM CURRENT_DATE)::integer)
  AND mm.mes = COALESCE(am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
  AND em.ano = COALESCE(am.ano, EXTRACT(year FROM CURRENT_DATE)::integer)
  AND em.mes = COALESCE(am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
WHERE u.ativo = true;


-- =============================================================================
-- 2. FUNÇÃO: recalcular_dados_mensais (snapshot operacional / competência fechada)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_result JSONB;
  v_fim_mes DATE;
  v_inicio_mes DATE;
  v_alunos_ativos INTEGER;
  v_alunos_pagantes INTEGER;
  v_matriculas_ativas INTEGER;
  v_matriculas_banda INTEGER;
  v_matriculas_2_curso INTEGER;
  v_novas_matriculas INTEGER;
  v_evasoes INTEGER;
  v_churn_rate NUMERIC;
BEGIN
  v_inicio_mes := DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::DATE;
  v_fim_mes := (v_inicio_mes + INTERVAL '1 month - 1 day')::DATE;

  -- alunos_ativos: pessoas distintas no snapshot (não filtra segundo curso)
  SELECT COUNT(DISTINCT a.nome) INTO v_alunos_ativos
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  -- alunos_pagantes: pessoas distintas com pelo menos 1 linha pagante
  SELECT COUNT(DISTINCT a.nome) INTO v_alunos_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND tm.conta_como_pagante = true;

  -- matriculas_ativas: todas as linhas no snapshot
  SELECT COUNT(*) INTO v_matriculas_ativas
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  -- matriculas_banda: linhas com is_projeto_banda=true
  SELECT COUNT(*) INTO v_matriculas_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND c.is_projeto_banda = true;

  -- matriculas_2_curso: is_segundo_curso=true E NÃO é banda
  SELECT COUNT(*) INTO v_matriculas_2_curso
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = true
    AND COALESCE(c.is_projeto_banda, false) = false;

  -- novas_matriculas: snapshot operacional (linhas novas no mês, exclui banda/coral/bolsista)
  SELECT COUNT(*) INTO v_novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula >= v_inicio_mes
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = false
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%');

  -- evasoes: deduplicadas por nome no mês
  SELECT COUNT(*) INTO v_evasoes
  FROM (
    SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)))
      m.id
    FROM movimentacoes_admin m
    WHERE m.unidade_id = p_unidade_id
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data >= v_inicio_mes
      AND m.data <= v_fim_mes
    ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.data DESC
  ) ev;

  -- churn_rate
  v_churn_rate := CASE
    WHEN COALESCE(v_alunos_pagantes, 0) > 0
    THEN ROUND((v_evasoes::NUMERIC / v_alunos_pagantes) * 100, 2)
    ELSE 0
  END;

  -- PERSISTIR em dados_mensais (parte 1: alunos e matrículas)
  INSERT INTO dados_mensais (
    unidade_id, ano, mes,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes, churn_rate,
    updated_at
  ) VALUES (
    p_unidade_id, p_ano, p_mes,
    v_alunos_ativos, v_alunos_pagantes, v_matriculas_ativas,
    v_matriculas_banda, v_matriculas_2_curso,
    v_novas_matriculas, v_evasoes, v_churn_rate,
    NOW()
  )
  ON CONFLICT (unidade_id, ano, mes) DO UPDATE SET
    alunos_ativos = EXCLUDED.alunos_ativos,
    alunos_pagantes = EXCLUDED.alunos_pagantes,
    matriculas_ativas = EXCLUDED.matriculas_ativas,
    matriculas_banda = EXCLUDED.matriculas_banda,
    matriculas_2_curso = EXCLUDED.matriculas_2_curso,
    novas_matriculas = EXCLUDED.novas_matriculas,
    evasoes = EXCLUDED.evasoes,
    churn_rate = EXCLUDED.churn_rate,
    updated_at = NOW();

  -- Retorno JSONB
  v_result := jsonb_build_object(
    'alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'novas_matriculas', v_novas_matriculas,
    'evasoes', v_evasoes,
    'churn_rate', v_churn_rate
  );

  RETURN v_result;
END;
$function$;
