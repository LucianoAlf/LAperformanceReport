-- =============================================================================
-- VALIDACAO_KPI_CG_MAIO2026_V5_FINANCEIRO.sql
-- SELECT-only para validação NOMINAL do financeiro antes de persistir.
--
-- Regras defendidas (Alf / OpenClaw):
--   1. ticket_medio = MRR contratual / alunos_pagantes
--   2. MRR = SUM(valor_parcela) de linhas pagantes no snapshot
--   3. inadimplencia = MRR inadimplente / MRR (percentual de VALOR, não de cabeça)
--   4. faturamento_previsto = MRR
--   5. faturamento_realizado = MRR - MRR inadimplente
--   6. NÃO grava colunas geradas (faturamento_estimado)
--   7. Fora de escopo: tempo_permanencia, taxa_renovacao, reajuste_parcelas
--   8. valor_parcela NULL/0 em linha pagante → alerta bloqueante
--
-- Esperado CG/Maio 2026 para confronto nominal:
--   • ticket_medio ≈ R$ 386 (card Alf)
--   • MRR nominal deve fechar com ADM/Emusys
-- =============================================================================

-- Parâmetros da competência fechada
WITH params AS (
  SELECT
    DATE '2026-05-01' AS inicio_mes,
    DATE '2026-05-31' AS fim_mes
),

unidade_cg AS (
  SELECT u.id AS unidade_id
  FROM unidades u
  WHERE u.nome ILIKE '%campo grande%'
),

-- Snapshot base de alunos no fim de Maio/2026
snapshot_base AS (
  SELECT
    a.unidade_id,
    a.id AS aluno_id,
    a.nome,
    a.status,
    a.data_matricula,
    a.data_saida,
    a.valor_parcela,
    a.status_pagamento,
    a.is_segundo_curso,
    tm.codigo AS tipo_matricula_codigo,
    tm.conta_como_pagante,
    tm.entra_ticket_medio,
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

-- ============================================================
-- 1. ALERTAS BLOQUEANTES: valor_parcela NULL/0 em linha pagante
-- ============================================================
alertas_parcela AS (
  SELECT
    sb.aluno_id,
    sb.nome,
    sb.valor_parcela,
    sb.status_pagamento,
    sb.conta_como_pagante,
    sb.tipo_matricula_codigo,
    sb.curso_nome
  FROM snapshot_base sb
  JOIN unidade_cg uc ON uc.unidade_id = sb.unidade_id
  WHERE sb.conta_como_pagante = true
    AND (sb.valor_parcela IS NULL OR sb.valor_parcela = 0)
),

-- ============================================================
-- 2. MRR contratual por linha (soma de parcelas pagantes válidas)
-- ============================================================
mrr_linha AS (
  SELECT
    COALESCE(SUM(sb.valor_parcela) FILTER (
      WHERE sb.conta_como_pagante = true
        AND sb.valor_parcela IS NOT NULL
        AND sb.valor_parcela > 0
    ), 0) AS mrr_contratual,
    COALESCE(SUM(sb.valor_parcela) FILTER (
      WHERE sb.status_pagamento = 'inadimplente'
        AND sb.conta_como_pagante = true
        AND sb.valor_parcela IS NOT NULL
        AND sb.valor_parcela > 0
    ), 0) AS mrr_inadimplente,
    COUNT(DISTINCT sb.nome) FILTER (WHERE sb.conta_como_pagante = true) AS alunos_pagantes
  FROM snapshot_base sb
  JOIN unidade_cg uc ON uc.unidade_id = sb.unidade_id
),

-- ============================================================
-- 3. Ticket médio = MRR / pagantes
-- ============================================================
ticket_calc AS (
  SELECT
    ml.mrr_contratual,
    ml.mrr_inadimplente,
    ml.alunos_pagantes,
    CASE
      WHEN COALESCE(ml.alunos_pagantes, 0) > 0
      THEN ROUND(ml.mrr_contratual::numeric / ml.alunos_pagantes, 2)
      ELSE 0
    END AS ticket_medio_calculado,
    CASE
      WHEN COALESCE(ml.mrr_contratual, 0) > 0
      THEN ROUND(ml.mrr_inadimplente::numeric / ml.mrr_contratual * 100, 2)
      ELSE 0
    END AS inadimplencia_pct_valor
  FROM mrr_linha ml
)

-- ============================================================
-- RESULTADO FINANCEIRO CG/MAIO 2026
-- ============================================================
SELECT
  'CG Maio 2026 — Financeiro' AS cenario,
  tc.mrr_contratual,
  tc.alunos_pagantes,
  tc.ticket_medio_calculado,
  tc.mrr_inadimplente,
  tc.inadimplencia_pct_valor,
  tc.mrr_contratual AS faturamento_previsto,
  (tc.mrr_contratual - tc.mrr_inadimplente) AS faturamento_realizado,
  CASE
    WHEN tc.ticket_medio_calculado BETWEEN 380 AND 395 THEN '✅ ticket ~R$386'
    ELSE '⚠️ ticket divergente: esperado ~R$386, obtido R$' || tc.ticket_medio_calculado::text
  END AS check_ticket,
  CASE
    WHEN (SELECT COUNT(*) FROM alertas_parcela) = 0 THEN '✅ sem alertas de parcela'
    ELSE '❌ ' || (SELECT COUNT(*) FROM alertas_parcela)::text || ' linha(s) pagante com parcela NULL/0'
  END AS check_alertas
FROM ticket_calc tc;


-- =============================================================================
-- DETALHAMENTO 1: quem tem parcela NULL/0 sendo pagante (alerta bloqueante)
-- =============================================================================
-- SELECT * FROM alertas_parcela;

-- =============================================================================
-- DETALHAMENTO 2: MRR nominal por aluno (para reconciliar com ADM/Emusys)
-- =============================================================================
-- SELECT
--   sb.nome,
--   SUM(sb.valor_parcela) AS mrr_por_pessoa,
--   COUNT(*) AS linhas,
--   string_agg(DISTINCT sb.curso_nome, ', ') AS cursos
-- FROM snapshot_base sb
-- JOIN unidade_cg uc ON uc.unidade_id = sb.unidade_id
-- WHERE sb.conta_como_pagante = true
--   AND sb.valor_parcela > 0
-- GROUP BY sb.nome
-- ORDER BY mrr_por_pessoa DESC;
