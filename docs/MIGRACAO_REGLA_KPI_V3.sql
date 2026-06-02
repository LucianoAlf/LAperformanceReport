-- =============================================================================
-- MIGRACAO_REGLA_KPI_V3.sql
-- Patch técnico para vw_kpis_gestao_mensal e recalcular_dados_mensais
-- Alinhado com regras validadas em auditoria CG/Maio 2026
-- NÃO EXECUTAR EM PRODUÇÃO SEM APROVAÇÃO DO ALFREDO/ALF
-- =============================================================================
-- REGRAS APLICADAS:
-- 1. alunos_ativos e alunos_pagantes = métricas por PESSOA (não por linha)
-- 2. matriculas_ativas, matriculas_banda, matriculas_2_curso = por LINHA
-- 3. Snapshot base: status IN ('ativo','trancado') + data_matricula <= fim_mes
--    + (data_saida IS NULL OR data_saida > fim_mes)
-- 4. alunos_pagantes: pelo menos 1 linha com conta_como_pagante=true no snapshot
-- 5. matriculas_2_curso: is_segundo_curso=true AND is_projeto_banda=false
-- 6. Não hardcoded nomes de alunos
-- 7. Preserva faturamento_estimado e saldo_liquido (não altera colunas geradas)
-- =============================================================================
-- RESSALVAS:
-- • vw_kpis_gestao_mensal é SNAPSHOT VIVO / MES CORRENTE (CURRENT_DATE).
--   Não é fonte de verdade histórica de competência fechada.
-- • ticket_medio: fórmula aplicada é provisória; pendente validação nominal
--   contra o card atual (R$ 386). Não usar para decisão até aprovação.
-- • novas_matriculas: contagem é SNAPSHOT OPERACIONAL (linhas novas no mês,
--   excluindo banda/coral/bolsista). Decisão semântica final (evento comercial
--   vs snapshot operacional) ainda pendente de produto.
-- =============================================================================

-- =============================================================================
-- 1. RECRIAR vw_kpis_gestao_mensal
-- =============================================================================

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH fim_mes_atual AS (
  SELECT DATE_TRUNC('month', CURRENT_DATE)::DATE AS inicio_mes,
         (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE AS fim_mes
),

-- Snapshot base: linhas válidas no mês corrente
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
    a.professor_atual_id,
    a.status_pagamento,
    tm.codigo AS tipo_matricula_codigo,
    tm.conta_como_pagante,
    tm.entra_ticket_medio,
    tm.entra_churn,
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

-- Matrículas novas do mês corrente (snapshot operacional; exclui banda/coral/bolsista)
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
  WHERE a.data_matricula >= fm.inicio_mes
    AND a.data_matricula <= fm.fim_mes
    AND COALESCE(a.is_segundo_curso, false) = false
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
  GROUP BY a.unidade_id, EXTRACT(year FROM a.data_matricula), EXTRACT(month FROM a.data_matricula)
),

-- Ticket médio por pessoa (soma parcelas da pessoa, não da linha)
-- ATENCAO: fórmula provisória, pendente validação nominal contra card atual.
alunos_ticket AS (
  SELECT
    sb.unidade_id,
    sb.nome AS chave_aluno,
    SUM(sb.valor_parcela) AS valor_total
  FROM snapshot_base sb
  WHERE sb.entra_ticket_medio = true
  GROUP BY sb.unidade_id, sb.nome
),

ticket_por_unidade AS (
  SELECT
    unidade_id,
    COUNT(*) AS total_alunos_ticket,
    SUM(valor_total) AS soma_parcelas,
    ROUND(AVG(valor_total), 2) AS ticket_medio_calculado
  FROM alunos_ticket
  GROUP BY unidade_id
),

-- KPIs por unidade no snapshot atual
alunos_mes AS (
  SELECT
    sb.unidade_id,
    EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
    EXTRACT(month FROM CURRENT_DATE)::integer AS mes,

    -- Ativos: pessoas distintas no snapshot (não filtra segundo curso — pessoa-level)
    COUNT(DISTINCT sb.nome) AS total_alunos,

    -- Pagantes: pessoas distintas com pelo menos 1 linha pagante no snapshot
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true)
      AS alunos_pagantes,

    -- Bolsistas integrais
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_INT')
      AS bolsistas_integrais,

    -- Bolsistas parciais
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_PARC')
      AS bolsistas_parciais,

    -- Banda/projeto: linhas (não pessoas)
    COUNT(*) FILTER (WHERE sb.is_projeto_banda = true)
      AS total_banda,

    -- Segundo curso operacional: is_segundo_curso=true E NÃO é banda
    COUNT(*) FILTER (
      WHERE sb.is_segundo_curso = true
        AND COALESCE(sb.is_projeto_banda, false) = false
    ) AS segundo_curso,

    -- MRR: soma de todas as linhas pagantes válidas
    SUM(sb.valor_parcela) FILTER (
      WHERE sb.conta_como_pagante = true
        AND COALESCE(sb.status_pagamento, '') <> 'sem_parcela'
    ) AS mrr,

    -- Inadimplentes
    COUNT(DISTINCT sb.nome) FILTER (
      WHERE sb.status_pagamento = 'inadimplente'
        AND sb.conta_como_pagante = true
    ) AS qtd_inadimplentes,

    -- MRR inadimplente
    COALESCE(SUM(sb.valor_parcela) FILTER (
      WHERE sb.status_pagamento = 'inadimplente'
        AND sb.conta_como_pagante = true
        AND COALESCE(sb.status_pagamento, '') <> 'sem_parcela'
    ), 0) AS mrr_inadimplente

  FROM snapshot_base sb
  GROUP BY sb.unidade_id
),

-- Permanência média (evasões + histórico)
permanencia_combinada AS (
  SELECT ah.unidade_id, ah.tempo_permanencia_meses AS meses
  FROM alunos_historico ah
  WHERE ah.tempo_permanencia_meses >= 4
  UNION ALL
  SELECT a.unidade_id, a.tempo_permanencia_meses
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status IN ('inativo', 'evadido')
    AND a.tempo_permanencia_meses >= 4
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA'))
    AND COALESCE(a.is_segundo_curso, false) = false
),

permanencia_calc AS (
  SELECT
    unidade_id,
    ROUND(AVG(meses), 1) AS tempo_permanencia_medio,
    COUNT(*) AS total_evasoes_calc
  FROM permanencia_combinada
  GROUP BY unidade_id
),

-- Evasões deduplicadas por nome no mês
evasoes_dedup AS (
  SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data))
    m.id,
    m.aluno_id,
    m.unidade_id,
    m.data AS data_evasao,
    m.tipo,
    COALESCE(m.valor_parcela_evasao, m.valor_parcela_anterior) AS valor_parcela
  FROM movimentacoes_admin m
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
  ORDER BY LOWER(TRIM(BOTH FROM m.aluno_nome)), m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data), m.aluno_id DESC NULLS LAST, m.data DESC
),

evasoes_mes AS (
  SELECT
    unidade_id,
    EXTRACT(year FROM data_evasao)::integer AS ano,
    EXTRACT(month FROM data_evasao)::integer AS mes,
    COUNT(*) AS total_evasoes
  FROM evasoes_dedup
  GROUP BY unidade_id, EXTRACT(year FROM data_evasao), EXTRACT(month FROM data_evasao)
),

-- Leads
leads_mes AS (
  SELECT
    l.unidade_id,
    EXTRACT(year FROM l.data_contato)::integer AS ano,
    EXTRACT(month FROM l.data_contato)::integer AS mes,
    SUM(CASE WHEN l.status IN ('novo', 'agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
    SUM(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
    SUM(CASE WHEN l.status IN ('experimental_realizada', 'compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
    SUM(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
    SUM(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
  FROM leads l
  GROUP BY l.unidade_id, EXTRACT(year FROM l.data_contato), EXTRACT(month FROM l.data_contato)
),

-- Renovações
renovacoes_mes AS (
  SELECT
    m.unidade_id,
    EXTRACT(year FROM m.data)::integer AS ano,
    EXTRACT(month FROM m.data)::integer AS mes,
    COUNT(*) FILTER (WHERE m.tipo = 'renovacao') AS renovacoes,
    COUNT(*) FILTER (WHERE m.tipo IN ('renovacao', 'nao_renovacao')) AS total_contratos,
    COUNT(*) FILTER (WHERE m.tipo = 'nao_renovacao') AS nao_renovacoes,
    ROUND(AVG((m.valor_parcela_novo - m.valor_parcela_anterior) / NULLIF(m.valor_parcela_anterior, 0) * 100)
      FILTER (WHERE m.tipo = 'renovacao' AND m.valor_parcela_anterior IS NOT NULL AND m.valor_parcela_novo IS NOT NULL
              AND m.valor_parcela_anterior > 0 AND m.valor_parcela_novo > m.valor_parcela_anterior), 2) AS reajuste_medio
  FROM movimentacoes_admin m
  WHERE m.tipo IN ('renovacao', 'nao_renovacao')
  GROUP BY m.unidade_id, EXTRACT(year FROM m.data), EXTRACT(month FROM m.data)
)

SELECT
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer) AS ano,
  COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer) AS mes,

  -- KPIs aluno (por pessoa)
  COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
  COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
  COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
  COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,

  -- KPIs matrícula (por linha)
  COALESCE(am.total_banda, 0)::integer AS total_banda,
  COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,

  -- Financeiro
  COALESCE(tpu.ticket_medio_calculado, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(am.mrr, 0)::numeric(12,2) AS mrr,
  (COALESCE(am.mrr, 0) * 12)::numeric(14,2) AS arr,
  COALESCE(pc.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia_medio,
  (COALESCE(tpu.ticket_medio_calculado, 0) * COALESCE(pc.tempo_permanencia_medio, 0))::numeric(12,2) AS ltv_medio,

  -- Inadimplência
  CASE WHEN COALESCE(am.alunos_pagantes, 0) > 0
       THEN ROUND(COALESCE(am.qtd_inadimplentes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
       ELSE 0 END::numeric(5,2) AS inadimplencia_pct,

  -- Faturamento (não altera colunas geradas, apenas view)
  COALESCE(am.mrr, 0)::numeric(12,2) AS faturamento_previsto,
  (COALESCE(am.mrr, 0) - COALESCE(am.mrr_inadimplente, 0))::numeric(12,2) AS faturamento_realizado,

  -- Leads e comercial
  COALESCE(lm.total_leads, 0)::integer AS total_leads,
  COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,
  COALESCE(mm.novas_matriculas, 0)::integer AS novas_matriculas,

  -- Evasões e churn
  COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
  CASE WHEN COALESCE(am.alunos_pagantes, 0) > 0
       THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
       ELSE 0 END::numeric(5,2) AS churn_rate,

  -- Renovação
  COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
  CASE WHEN COALESCE(rm.total_contratos, 0) > 0
       THEN ROUND(rm.renovacoes::numeric / rm.total_contratos::numeric * 100, 2)
       ELSE 0 END::numeric(5,2) AS taxa_renovacao,
  COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio

FROM unidades u
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id
LEFT JOIN alunos_mes am ON am.unidade_id = u.id
LEFT JOIN ticket_por_unidade tpu ON tpu.unidade_id = u.id
LEFT JOIN permanencia_calc pc ON pc.unidade_id = u.id
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id
  AND mm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer)
  AND mm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id
  AND em.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer)
  AND em.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id
  AND rm.ano = COALESCE(lm.ano, am.ano, EXTRACT(year FROM CURRENT_DATE)::integer)
  AND rm.mes = COALESCE(lm.mes, am.mes, EXTRACT(month FROM CURRENT_DATE)::integer)
WHERE u.ativo = true;


-- =============================================================================
-- 2. RECRIAR recalcular_dados_mensais
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recalcular_dados_mensais(p_ano integer, p_mes integer, p_unidade_id uuid)
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
  v_ticket_medio NUMERIC;
  v_tempo_permanencia NUMERIC;
  v_taxa_renovacao NUMERIC;
  v_reajuste_medio NUMERIC;
  v_inadimplencia NUMERIC;
BEGIN
  v_inicio_mes := DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::DATE;
  v_fim_mes := (v_inicio_mes + INTERVAL '1 month - 1 day')::DATE;

  -- ---------------------------------------------------------
  -- alunos_ativos: pessoas distintas no snapshot base
  -- (não filtra segundo curso — pessoa-level)
  -- ---------------------------------------------------------
  SELECT COUNT(DISTINCT a.nome) INTO v_alunos_ativos
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  -- ---------------------------------------------------------
  -- alunos_pagantes: pessoas distintas com pelo menos 1 linha
  -- conta_como_pagante=true no snapshot base
  -- ---------------------------------------------------------
  SELECT COUNT(DISTINCT a.nome) INTO v_alunos_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND tm.conta_como_pagante = true;

  -- ---------------------------------------------------------
  -- matriculas_ativas: todas as linhas no snapshot
  -- ---------------------------------------------------------
  SELECT COUNT(*) INTO v_matriculas_ativas
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  -- ---------------------------------------------------------
  -- matriculas_banda: linhas onde curso.is_projeto_banda=true
  -- ---------------------------------------------------------
  SELECT COUNT(*) INTO v_matriculas_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND c.is_projeto_banda = true;

  -- ---------------------------------------------------------
  -- matriculas_2_curso: segundo curso operacional
  -- is_segundo_curso=true AND NÃO é banda
  -- ---------------------------------------------------------
  SELECT COUNT(*) INTO v_matriculas_2_curso
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = true
    AND COALESCE(c.is_projeto_banda, false) = false;

  -- ---------------------------------------------------------
  -- novas_matriculas: linhas novas no mês (snapshot operacional;
  -- exclui banda/coral/bolsista).
  -- NOTA: definição semântica final (evento comercial vs snapshot)
  -- ainda pendente de produto.
  -- ---------------------------------------------------------
  SELECT COUNT(*) INTO v_novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND COALESCE(a.is_segundo_curso, false) = false
    AND a.data_matricula >= v_inicio_mes
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%');

  -- ---------------------------------------------------------
  -- evasoes: deduplicadas por nome no mês
  -- ---------------------------------------------------------
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

  -- ---------------------------------------------------------
  -- churn_rate
  -- ---------------------------------------------------------
  v_churn_rate := CASE
    WHEN COALESCE(v_alunos_pagantes, 0) > 0
    THEN ROUND((v_evasoes::NUMERIC / v_alunos_pagantes) * 100, 2)
    ELSE 0
  END;

  -- ---------------------------------------------------------
  -- ticket_medio: média da soma de parcelas por pessoa
  -- ATENCAO: fórmula provisória, pendente validação nominal
  -- contra card atual. Não usar para decisão até aprovação.
  -- ---------------------------------------------------------
  SELECT COALESCE(ROUND(AVG(valor_total), 2), 0) INTO v_ticket_medio
  FROM (
    SELECT a.nome, SUM(a.valor_parcela) AS valor_total
    FROM alunos a
    LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
    WHERE a.unidade_id = p_unidade_id
      AND a.status IN ('ativo', 'trancado')
      AND a.data_matricula <= v_fim_mes
      AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
      AND (tm.entra_ticket_medio = true OR tm.id IS NULL)
    GROUP BY a.nome
  ) t;

  -- ---------------------------------------------------------
  -- tempo_permanencia
  -- ---------------------------------------------------------
  SELECT COALESCE(ROUND(AVG(tempo_permanencia_meses), 1), 0) INTO v_tempo_permanencia
  FROM alunos
  WHERE unidade_id = p_unidade_id
    AND status IN ('ativo', 'trancado')
    AND data_matricula <= v_fim_mes
    AND (data_saida IS NULL OR data_saida > v_fim_mes);

  -- ---------------------------------------------------------
  -- taxa_renovacao
  -- ---------------------------------------------------------
  WITH renov_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE tipo = 'renovacao') AS renov_count,
      COUNT(*) FILTER (WHERE tipo = 'nao_renovacao') AS nao_renov_count
    FROM movimentacoes_admin
    WHERE unidade_id = p_unidade_id
      AND data >= v_inicio_mes
      AND data <= v_fim_mes
      AND tipo IN ('renovacao', 'nao_renovacao')
  )
  SELECT CASE
    WHEN (renov_count + nao_renov_count) > 0
    THEN ROUND((renov_count::NUMERIC / (renov_count + nao_renov_count)) * 100, 2)
    ELSE 0
  END INTO v_taxa_renovacao
  FROM renov_stats;

  -- ---------------------------------------------------------
  -- reajuste_medio
  -- ---------------------------------------------------------
  SELECT COALESCE(ROUND(AVG(
    CASE
      WHEN valor_parcela_anterior > 0 AND valor_parcela_novo > valor_parcela_anterior
      THEN ((valor_parcela_novo - valor_parcela_anterior) / valor_parcela_anterior) * 100
      ELSE NULL
    END
  ), 2), 0) INTO v_reajuste_medio
  FROM movimentacoes_admin
  WHERE unidade_id = p_unidade_id
    AND tipo = 'renovacao'
    AND data >= v_inicio_mes
    AND data <= v_fim_mes
    AND valor_parcela_anterior > 0
    AND valor_parcela_novo > valor_parcela_anterior;

  -- ---------------------------------------------------------
  -- inadimplencia_pct (calculado, não persistido separadamente)
  -- ---------------------------------------------------------
  v_inadimplencia := 0; -- placeholder; calcular se necessário

  -- ---------------------------------------------------------
  -- PERSISTIR em dados_mensais
  --
  -- NOTA: inadimplencia é calculada pela view (inadimplencia_pct)
  -- e não é persistida diretamente. Se a coluna dados_mensais.inadimplencia
  -- for NOT NULL sem default, adicione-a aqui com valor 0 ou NULL
  -- conforme o schema. Conferir schema antes de executar.
  -- ---------------------------------------------------------
  INSERT INTO dados_mensais (
    unidade_id, ano, mes,
    alunos_ativos, alunos_pagantes, matriculas_ativas,
    matriculas_banda, matriculas_2_curso,
    novas_matriculas, evasoes,
    churn_rate, ticket_medio, tempo_permanencia,
    taxa_renovacao, reajuste_parcelas,
    updated_at
  ) VALUES (
    p_unidade_id, p_ano, p_mes,
    v_alunos_ativos, v_alunos_pagantes, v_matriculas_ativas,
    v_matriculas_banda, v_matriculas_2_curso,
    v_novas_matriculas, v_evasoes,
    v_churn_rate, v_ticket_medio, v_tempo_permanencia,
    v_taxa_renovacao, v_reajuste_medio,
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
    ticket_medio = EXCLUDED.ticket_medio,
    tempo_permanencia = EXCLUDED.tempo_permanencia,
    taxa_renovacao = EXCLUDED.taxa_renovacao,
    reajuste_parcelas = EXCLUDED.reajuste_parcelas,
    updated_at = NOW();

  -- ---------------------------------------------------------
  -- Retorno JSONB (faturamento_estimado e saldo_liquido preservados)
  -- ticket_medio marcado como provisório no retorno
  -- ---------------------------------------------------------
  v_result := jsonb_build_object(
    'alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'matriculas_ativas', v_matriculas_ativas,
    'novas_matriculas', v_novas_matriculas,
    'evasoes', v_evasoes,
    'churn_rate', v_churn_rate,
    'ticket_medio', v_ticket_medio,
    'ticket_medio_status', 'PROVISORIO_PENDENTE_VALIDACAO',
    'taxa_renovacao', v_taxa_renovacao,
    'reajuste_medio', v_reajuste_medio,
    'faturamento_estimado', v_alunos_pagantes * v_ticket_medio,
    'saldo_liquido', v_novas_matriculas - v_evasoes
  );

  RETURN v_result;
END;
$function$;
