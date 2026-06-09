-- ============================================================================
-- P0.1R - Reajuste medio canonico no financeiro vivo
-- Projeto alvo: ouqwbbermlzqqvtqwlul
-- Status: EXECUTAVEL SOMENTE COM CONEXAO CONFIRMADA NO PROJETO ALVO.
--
-- Contexto:
-- - P0.1Q corrigiu inadimplencia/faturamento/reajuste vivo na RPC canonica.
-- - A regra de reajuste ainda contava alguns aumentos que nao devem entrar
--   na media executiva: bolsistas, banda/projeto/coral e itens zerados/retencao.
--
-- Regra canonica do reajuste medio:
-- - contar apenas renovacoes confirmadas com agente;
-- - valor anterior > 0;
-- - valor novo > valor anterior;
-- - excluir bolsistas;
-- - excluir banda/projeto/coral;
-- - reducao, zerado e igual nao entram na media.
--
-- Nao faz:
-- - DDL em tabelas de negocio.
-- - UPDATE/DELETE/INSERT em dados historicos.
-- - backfill/recalculo/snapshot.
-- - fechamento de competencia.
-- - alteracao em views legadas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_kpis_alunos_financeiro_vivo_canonico(
  p_unidade_id uuid DEFAULT NULL::uuid,
  p_ano integer DEFAULT (EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer,
  p_mes integer DEFAULT (EXTRACT(month FROM (now() AT TIME ZONE 'America/Sao_Paulo')))::integer
)
RETURNS TABLE (
  unidade_id uuid,
  mrr numeric,
  alunos_pagantes integer,
  inadimplentes integer,
  inadimplencia_valor numeric,
  inadimplencia_pct numeric,
  faturamento_realizado numeric,
  reajustes_validos integer,
  reajuste_pct numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
WITH params AS (
  SELECT
    (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje,
    make_date(p_ano, p_mes, 1) AS inicio_mes,
    LEAST(
      (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      (make_date(p_ano, p_mes, 1) + interval '1 month' - interval '1 day')::date
    ) AS data_corte
),
unidades_base AS (
  SELECT u.id AS unidade_id
  FROM public.unidades u
  WHERE u.ativo = true
    AND (p_unidade_id IS NULL OR u.id = p_unidade_id)
),
alunos_base AS (
  SELECT
    a.id,
    a.nome,
    a.unidade_id,
    COALESCE(a.valor_parcela, 0)::numeric AS valor_parcela,
    COALESCE(a.status_pagamento, '') AS status_pagamento,
    COALESCE(tm.entra_ticket_medio, false) AS entra_ticket_medio,
    CASE
      WHEN btrim(COALESCE(a.nome, '')) <> ''
        THEN lower(btrim(a.nome)) || '|' || a.unidade_id::text
      ELSE NULL
    END AS pessoa_key
  FROM public.alunos a
  JOIN unidades_base ub ON ub.unidade_id = a.unidade_id
  CROSS JOIN params p
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE a.arquivado_em IS NULL
    AND a.status IN ('ativo', 'trancado')
    AND (a.data_matricula IS NULL OR a.data_matricula <= p.data_corte)
    AND (a.data_saida IS NULL OR a.data_saida > p.data_corte)
),
pessoas AS (
  SELECT
    ab.unidade_id,
    ab.pessoa_key,
    COALESCE(SUM(
      CASE
        WHEN ab.entra_ticket_medio = true AND ab.valor_parcela > 0
          THEN ab.valor_parcela
        ELSE 0
      END
    ), 0)::numeric AS mrr_pessoa,
    BOOL_OR(lower(ab.status_pagamento) = 'inadimplente' AND ab.valor_parcela > 0) AS inadimplente,
    COALESCE(SUM(
      CASE
        WHEN lower(ab.status_pagamento) = 'inadimplente' AND ab.valor_parcela > 0
          THEN ab.valor_parcela
        ELSE 0
      END
    ), 0)::numeric AS inadimplencia_valor_pessoa
  FROM alunos_base ab
  WHERE ab.pessoa_key IS NOT NULL
  GROUP BY ab.unidade_id, ab.pessoa_key
),
financeiro AS (
  SELECT
    ub.unidade_id,
    COALESCE(SUM(p.mrr_pessoa), 0)::numeric AS mrr,
    COUNT(p.pessoa_key) FILTER (WHERE p.mrr_pessoa > 0)::integer AS alunos_pagantes,
    COUNT(p.pessoa_key) FILTER (WHERE p.inadimplente = true)::integer AS inadimplentes,
    COALESCE(SUM(p.inadimplencia_valor_pessoa), 0)::numeric AS inadimplencia_valor
  FROM unidades_base ub
  LEFT JOIN pessoas p ON p.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
),
reajustes_base AS (
  SELECT
    ma.unidade_id,
    ((COALESCE(ma.valor_parcela_novo, 0)::numeric - COALESCE(ma.valor_parcela_anterior, 0)::numeric)
      / NULLIF(COALESCE(ma.valor_parcela_anterior, 0)::numeric, 0)) * 100 AS percentual_reajuste
  FROM public.movimentacoes_admin ma
  JOIN unidades_base ub ON ub.unidade_id = ma.unidade_id
  CROSS JOIN params p
  LEFT JOIN public.alunos a ON a.id = ma.aluno_id
  LEFT JOIN public.cursos curso_mov ON curso_mov.id = ma.curso_id
  LEFT JOIN public.cursos curso_aluno ON curso_aluno.id = a.curso_id
  LEFT JOIN public.tipos_matricula tm ON tm.id = a.tipo_matricula_id
  WHERE ma.tipo = 'renovacao'
    AND ma.data >= p.inicio_mes
    AND ma.data <= p.data_corte
    AND btrim(COALESCE(ma.agente_comercial, '')) <> ''
    AND COALESCE(ma.valor_parcela_anterior, 0)::numeric > 0
    AND COALESCE(ma.valor_parcela_novo, 0)::numeric > COALESCE(ma.valor_parcela_anterior, 0)::numeric
    AND NOT COALESCE(curso_mov.is_projeto_banda, curso_aluno.is_projeto_banda, false)
    AND lower(COALESCE(curso_mov.nome, curso_aluno.nome, '')) NOT LIKE '%banda%'
    AND lower(COALESCE(curso_mov.nome, curso_aluno.nome, '')) NOT LIKE '%garage%'
    AND lower(COALESCE(curso_mov.nome, curso_aluno.nome, '')) NOT LIKE '%projeto%'
    AND lower(COALESCE(curso_mov.nome, curso_aluno.nome, '')) NOT LIKE '%coral%'
    AND COALESCE(tm.codigo, '') NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
    AND COALESCE(a.tipo_matricula_id, 0) NOT IN (3, 4, 5)
    AND lower(COALESCE(a.classificacao, '')) NOT LIKE '%bols%'
),
reajustes AS (
  SELECT
    ub.unidade_id,
    COUNT(rb.percentual_reajuste)::integer AS reajustes_validos,
    COALESCE(AVG(rb.percentual_reajuste), 0)::numeric AS reajuste_pct
  FROM unidades_base ub
  LEFT JOIN reajustes_base rb ON rb.unidade_id = ub.unidade_id
  GROUP BY ub.unidade_id
)
SELECT
  f.unidade_id,
  f.mrr,
  f.alunos_pagantes,
  f.inadimplentes,
  f.inadimplencia_valor,
  CASE
    WHEN f.alunos_pagantes > 0 THEN ROUND(f.inadimplentes::numeric / f.alunos_pagantes * 100, 2)
    ELSE 0
  END AS inadimplencia_pct,
  GREATEST(f.mrr - f.inadimplencia_valor, 0) AS faturamento_realizado,
  COALESCE(r.reajustes_validos, 0) AS reajustes_validos,
  COALESCE(ROUND(r.reajuste_pct, 2), 0) AS reajuste_pct
FROM financeiro f
LEFT JOIN reajustes r ON r.unidade_id = f.unidade_id;
$function$;

COMMENT ON FUNCTION public.get_kpis_alunos_financeiro_vivo_canonico(uuid, integer, integer)
IS 'P0.1R: reajuste medio canonico exclui bolsistas, banda/projeto/coral, zerados e retencoes.';

-- ============================================================================
-- CHECKLIST SELECT-ONLY POS-EXECUCAO
-- ============================================================================
--
-- SELECT public.get_kpis_alunos_canonicos(
--   '2ec861f6-023f-4d7b-9927-3960ad8c2a92'::uuid, 2026, 6
-- ) #> '{totais}' AS cg_jun_totais;
--
-- Esperado em 2026-06-09:
-- - reajustes_validos = 20
-- - reajuste_pct ~ 11.72
--
-- SELECT public.get_kpis_alunos_canonicos(
--   '368d47f5-2d88-4475-bc14-ba084a9a348e'::uuid, 2026, 6
-- ) #> '{totais}' AS barra_jun_totais;
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- Reaplicar a definicao de public.get_kpis_alunos_financeiro_vivo_canonico
-- da migration 20260609_p01q_financeiro_vivo_canonico_rpc.sql.
-- ============================================================================
