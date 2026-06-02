-- =============================================================================
-- MIGRACAO_REGLA_KPI_V5_ALUNOS.sql
-- Autor: Alfredo / OpenClaw (refinado pelo Alf)
-- Data: 2026-06-01
--
-- Objetivo:
--   Corrigir SOMENTE KPIs de alunos/matrículas/evasões/churn, preservando
--   o contrato público atual de vw_kpis_gestao_mensal e sem mexer em ticket,
--   MRR, faturamento, inadimplência, renovação ou reajuste.
--
-- Status:
--   DRAFT PARA REVISÃO TÉCNICA. NÃO EXECUTAR EM PRODUÇÃO SEM APROVAÇÃO DO ALF.
--
-- Guardrails aplicados:
--   - Sem comando de remoção/recriação destrutiva da view.
--   - Sem psql meta-comandos.
--   - View mantém as colunas públicas atuais na mesma ordem.
--   - Adiciona matriculas_ativas apenas ao FINAL da view, para não quebrar
--     o contrato existente caso PostgreSQL permita extensão por CREATE OR REPLACE.
--   - Financeiro legado fica isolado em CTE própria para não mudar ticket/MRR agora.
--   - Função não grava colunas geradas: faturamento_estimado / saldo_liquido.
--   - Função não grava ticket_medio / inadimplencia / taxa_renovacao / reajuste_parcelas.
-- =============================================================================

-- =============================================================================
-- 1. VIEW PÚBLICA: vw_kpis_gestao_mensal
--    Snapshot vivo do mês corrente, mantendo contrato atual da view.
-- =============================================================================

CREATE OR REPLACE VIEW vw_kpis_gestao_mensal AS
WITH params AS (
  SELECT
    DATE_TRUNC('month', CURRENT_DATE)::date AS inicio_mes,
    (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date AS fim_mes,
    EXTRACT(YEAR FROM CURRENT_DATE)::integer AS ano,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer AS mes
),

-- Mantém métricas comerciais do contrato atual, restritas ao mês corrente.
leads_mes AS (
  SELECT
    l.unidade_id,
    p.ano,
    p.mes,
    SUM(CASE WHEN l.status IN ('novo','agendado') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS total_leads,
    SUM(CASE WHEN l.status = 'experimental_agendada' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_agendadas,
    SUM(CASE WHEN l.status IN ('experimental_realizada','compareceu') THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS experimentais_realizadas,
    SUM(CASE WHEN l.status = 'experimental_faltou' THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS faltaram,
    SUM(CASE WHEN l.arquivado = true THEN COALESCE(l.quantidade, 1) ELSE 0 END) AS leads_arquivados
  FROM leads l
  CROSS JOIN params p
  WHERE l.data_contato >= p.inicio_mes
    AND l.data_contato < (p.fim_mes + INTERVAL '1 day')
  GROUP BY l.unidade_id, p.ano, p.mes
),

-- Snapshot operacional de matrículas válidas no fim do mês corrente.
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
  CROSS JOIN params p
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
),

-- KPIs corrigidos de alunos/matrículas.
alunos_mes AS (
  SELECT
    sb.unidade_id,
    p.ano,
    p.mes,

    -- Pessoa-level: aluno ativo é pessoa distinta no snapshot.
    COUNT(DISTINCT sb.nome) AS total_alunos,

    -- Pessoa-level: pagante é pessoa com pelo menos uma linha pagante.
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true) AS alunos_pagantes,

    -- Pessoa-level para contagem de bolsistas.
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_INT') AS bolsistas_integrais,
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.tipo_matricula_codigo = 'BOLSISTA_PARC') AS bolsistas_parciais,

    -- Linha-level: matrículas ativas.
    COUNT(*) AS matriculas_ativas,

    -- Linha-level: banda/projeto separado.
    COUNT(*) FILTER (WHERE sb.is_projeto_banda = true) AS total_banda,

    -- Linha-level: segundo curso operacional sem banda/projeto.
    COUNT(*) FILTER (
      WHERE COALESCE(sb.is_segundo_curso, false) = true
        AND COALESCE(sb.is_projeto_banda, false) = false
    ) AS segundo_curso
  FROM snapshot_base sb
  CROSS JOIN params p
  GROUP BY sb.unidade_id, p.ano, p.mes
),

-- Financeiro legado preservado de propósito: NÃO validar/alterar ticket agora.
-- A regra financeira correta entra em migration separada após validação nominal.
financeiro_legado AS (
  SELECT
    a.unidade_id,
    AVG(a.valor_parcela) FILTER (WHERE tm.entra_ticket_medio = true) AS ticket_medio,
    SUM(a.valor_parcela) FILTER (WHERE tm.conta_como_pagante = true) AS mrr,
    AVG(a.tempo_permanencia_meses) AS tempo_permanencia_medio
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.status = 'ativo'
  GROUP BY a.unidade_id
),

-- Novas matrículas como snapshot operacional validado para CG/Maio.
matriculas_mes AS (
  SELECT
    a.unidade_id,
    p.ano,
    p.mes,
    COUNT(*) AS novas_matriculas
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  LEFT JOIN cursos c ON c.id = a.curso_id
  CROSS JOIN params p
  WHERE a.status IN ('ativo', 'trancado')
    AND a.data_matricula >= p.inicio_mes
    AND a.data_matricula <= p.fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > p.fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = false
    AND (tm.codigo IS NULL OR tm.codigo NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC'))
    AND COALESCE(c.is_projeto_banda, false) = false
    AND (c.nome IS NULL OR c.nome NOT ILIKE '%canto coral%')
  GROUP BY a.unidade_id, p.ano, p.mes
),

-- Evasões deduplicadas por pessoa no mês corrente.
evasoes_dedup AS (
  SELECT DISTINCT ON (
    LOWER(TRIM(BOTH FROM m.aluno_nome)),
    m.unidade_id,
    p.ano,
    p.mes
  )
    m.id,
    m.aluno_id,
    m.aluno_nome,
    m.unidade_id,
    p.ano,
    p.mes,
    m.data AS data_evasao
  FROM movimentacoes_admin m
  CROSS JOIN params p
  WHERE m.tipo IN ('evasao', 'nao_renovacao')
    AND m.data >= p.inicio_mes
    AND m.data < (p.fim_mes + INTERVAL '1 day')
  ORDER BY
    LOWER(TRIM(BOTH FROM m.aluno_nome)),
    m.unidade_id,
    p.ano,
    p.mes,
    m.aluno_id DESC NULLS LAST,
    m.data DESC
),

evasoes_mes AS (
  SELECT
    unidade_id,
    ano,
    mes,
    COUNT(*) AS total_evasoes
  FROM evasoes_dedup
  GROUP BY unidade_id, ano, mes
),

-- Renovação/reajuste preservados como estavam no contrato atual.
-- Fora de escopo da V5_ALUNOS — não alterar.
renovacoes_mes AS (
  SELECT
    r.unidade_id,
    p.ano,
    p.mes,
    COUNT(*) FILTER (WHERE r.status = 'renovado') AS renovacoes,
    COUNT(*) AS total_contratos,
    AVG(r.percentual_reajuste) FILTER (WHERE r.status = 'renovado') AS reajuste_medio
  FROM renovacoes r
  CROSS JOIN params p
  WHERE r.data_renovacao >= p.inicio_mes
    AND r.data_renovacao < (p.fim_mes + INTERVAL '1 day')
  GROUP BY r.unidade_id, p.ano, p.mes
)

SELECT
  u.id AS unidade_id,
  u.nome AS unidade_nome,
  p.ano AS ano,
  p.mes AS mes,

  -- Contrato público existente — alunos/matrículas corrigidos.
  COALESCE(am.total_alunos, 0)::integer AS total_alunos_ativos,
  COALESCE(am.alunos_pagantes, 0)::integer AS total_alunos_pagantes,
  COALESCE(am.bolsistas_integrais, 0)::integer AS total_bolsistas_integrais,
  COALESCE(am.bolsistas_parciais, 0)::integer AS total_bolsistas_parciais,
  COALESCE(am.total_banda, 0)::integer AS total_banda,
  COALESCE(am.segundo_curso, 0)::integer AS total_segundo_curso,

  -- Contrato público existente — financeiro legado preservado.
  COALESCE(fl.ticket_medio, 0)::numeric(10,2) AS ticket_medio,
  COALESCE(fl.mrr, 0)::numeric(12,2) AS mrr,
  (COALESCE(fl.mrr, 0) * 12)::numeric(14,2) AS arr,
  COALESCE(fl.tempo_permanencia_medio, 0)::numeric(5,1) AS tempo_permanencia_medio,
  (COALESCE(fl.ticket_medio, 0) * COALESCE(fl.tempo_permanencia_medio, 0))::numeric(12,2) AS ltv_medio,
  0::numeric(5,2) AS inadimplencia_pct,
  COALESCE(fl.mrr, 0)::numeric(12,2) AS faturamento_previsto,
  COALESCE(fl.mrr, 0)::numeric(12,2) AS faturamento_realizado,

  -- Contrato público existente — comercial preservado.
  COALESCE(lm.total_leads, 0)::integer AS total_leads,
  COALESCE(lm.experimentais_agendadas, 0)::integer AS experimentais_agendadas,
  COALESCE(lm.experimentais_realizadas, 0)::integer AS experimentais_realizadas,

  -- Contrato público existente — novas/evasões/churn corrigidos.
  COALESCE(mm.novas_matriculas, 0)::integer AS novas_matriculas,
  COALESCE(em.total_evasoes, 0)::integer AS total_evasoes,
  CASE
    WHEN COALESCE(am.alunos_pagantes, 0) > 0
    THEN ROUND(COALESCE(em.total_evasoes, 0)::numeric / am.alunos_pagantes::numeric * 100, 2)
    ELSE 0
  END::numeric(5,2) AS churn_rate,

  -- Contrato público existente — retenção/reajuste preservados.
  COALESCE(rm.renovacoes, 0)::integer AS renovacoes,
  CASE
    WHEN COALESCE(rm.total_contratos, 0) > 0
    THEN ROUND(rm.renovacoes::numeric / rm.total_contratos::numeric * 100, 2)
    ELSE 0
  END::numeric(5,2) AS taxa_renovacao,
  COALESCE(rm.reajuste_medio, 0)::numeric(5,2) AS reajuste_medio,

  -- Coluna nova adicionada ao final para evitar reordenar contrato existente.
  COALESCE(am.matriculas_ativas, 0)::integer AS matriculas_ativas

FROM unidades u
CROSS JOIN params p
LEFT JOIN alunos_mes am ON am.unidade_id = u.id AND am.ano = p.ano AND am.mes = p.mes
LEFT JOIN financeiro_legado fl ON fl.unidade_id = u.id
LEFT JOIN leads_mes lm ON lm.unidade_id = u.id AND lm.ano = p.ano AND lm.mes = p.mes
LEFT JOIN matriculas_mes mm ON mm.unidade_id = u.id AND mm.ano = p.ano AND mm.mes = p.mes
LEFT JOIN evasoes_mes em ON em.unidade_id = u.id AND em.ano = p.ano AND em.mes = p.mes
LEFT JOIN renovacoes_mes rm ON rm.unidade_id = u.id AND rm.ano = p.ano AND rm.mes = p.mes
WHERE u.ativo = true;


-- =============================================================================
-- 2. FUNÇÃO: recalcular_dados_mensais
--    Atualiza somente os campos de alunos/matrículas/evasões/churn.
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
  v_result jsonb;
  v_inicio_mes date;
  v_fim_mes date;
  v_alunos_ativos integer;
  v_alunos_pagantes integer;
  v_matriculas_ativas integer;
  v_matriculas_banda integer;
  v_matriculas_2_curso integer;
  v_novas_matriculas integer;
  v_evasoes integer;
  v_churn_rate numeric;
BEGIN
  v_inicio_mes := DATE_TRUNC('month', MAKE_DATE(p_ano, p_mes, 1))::date;
  v_fim_mes := (v_inicio_mes + INTERVAL '1 month - 1 day')::date;

  -- Pessoa-level: alunos ativos no snapshot.
  SELECT COUNT(DISTINCT a.nome)
  INTO v_alunos_ativos
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  -- Pessoa-level: pagantes no snapshot por tipo_matricula.conta_como_pagante.
  SELECT COUNT(DISTINCT a.nome)
  INTO v_alunos_pagantes
  FROM alunos a
  LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND tm.conta_como_pagante = true;

  -- Linha-level: matrículas ativas no snapshot.
  SELECT COUNT(*)
  INTO v_matriculas_ativas
  FROM alunos a
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes);

  -- Linha-level: banda/projeto.
  SELECT COUNT(*)
  INTO v_matriculas_banda
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND c.is_projeto_banda = true;

  -- Linha-level: segundo curso operacional, excluindo banda/projeto.
  SELECT COUNT(*)
  INTO v_matriculas_2_curso
  FROM alunos a
  LEFT JOIN cursos c ON c.id = a.curso_id
  WHERE a.unidade_id = p_unidade_id
    AND a.status IN ('ativo', 'trancado')
    AND a.data_matricula <= v_fim_mes
    AND (a.data_saida IS NULL OR a.data_saida > v_fim_mes)
    AND COALESCE(a.is_segundo_curso, false) = true
    AND COALESCE(c.is_projeto_banda, false) = false;

  -- Snapshot operacional de novas matrículas.
  SELECT COUNT(*)
  INTO v_novas_matriculas
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

  -- Evasões deduplicadas por pessoa no mês.
  SELECT COUNT(*)
  INTO v_evasoes
  FROM (
    SELECT DISTINCT ON (LOWER(TRIM(BOTH FROM m.aluno_nome)))
      m.id
    FROM movimentacoes_admin m
    WHERE m.unidade_id = p_unidade_id
      AND m.tipo IN ('evasao', 'nao_renovacao')
      AND m.data >= v_inicio_mes
      AND m.data < (v_fim_mes + INTERVAL '1 day')
    ORDER BY
      LOWER(TRIM(BOTH FROM m.aluno_nome)),
      m.aluno_id DESC NULLS LAST,
      m.data DESC
  ) ev;

  v_churn_rate := CASE
    WHEN COALESCE(v_alunos_pagantes, 0) > 0
    THEN ROUND((v_evasoes::numeric / v_alunos_pagantes::numeric) * 100, 2)
    ELSE 0
  END;

  -- Upsert apenas de campos de alunos/matrículas/evasões/churn.
  -- Não altera ticket_medio, inadimplencia, taxa_renovacao, tempo_permanencia,
  -- reajuste_parcelas nem colunas geradas.
  INSERT INTO dados_mensais (
    unidade_id,
    ano,
    mes,
    alunos_ativos,
    alunos_pagantes,
    matriculas_ativas,
    matriculas_banda,
    matriculas_2_curso,
    novas_matriculas,
    evasoes,
    churn_rate,
    updated_at
  ) VALUES (
    p_unidade_id,
    p_ano,
    p_mes,
    v_alunos_ativos,
    v_alunos_pagantes,
    v_matriculas_ativas,
    v_matriculas_banda,
    v_matriculas_2_curso,
    v_novas_matriculas,
    v_evasoes,
    v_churn_rate,
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

  v_result := jsonb_build_object(
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'ano', p_ano,
    'mes', p_mes,
    'unidade_id', p_unidade_id,
    'alunos_ativos', v_alunos_ativos,
    'alunos_pagantes', v_alunos_pagantes,
    'matriculas_ativas', v_matriculas_ativas,
    'matriculas_banda', v_matriculas_banda,
    'matriculas_2_curso', v_matriculas_2_curso,
    'novas_matriculas', v_novas_matriculas,
    'evasoes', v_evasoes,
    'churn_rate', v_churn_rate,
    'financeiro_alterado', false
  );

  RETURN v_result;
END;
$function$;
