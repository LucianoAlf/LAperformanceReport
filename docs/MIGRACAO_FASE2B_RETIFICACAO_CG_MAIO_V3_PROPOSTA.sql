-- =============================================================================
-- MIGRACAO_FASE2B_RETIFICACAO_CG_MAIO_V3_PROPOSTA.sql
--
-- FASE 2B-V3 — RETIFICAÇÃO CONTROLADA CG/MAIO/2026
--
-- Restaurar snapshot validado via audit_log old_record do cron job às 03:00.
--
-- NÃO roda backfill.
-- NÃO mexe em Barra/Recreio.
-- NÃO mexe em financeiro.
--
-- Só executa se o estado atual ainda for EXATAMENTE:
--   alunos_ativos: 489, alunos_pagantes: 463, matriculas_ativas: 552,
--   matriculas_banda: 40, matriculas_2_curso: 27, novas_matriculas: 23,
--   evasoes: 13, churn_rate: 2.81
--
-- Se o estado atual divergir, a transação ABORTA sem alterar nada.
-- =============================================================================


-- =============================================================================
-- 0) GARANTIR TABELA DE AUDITORIA
--
-- A Fase 2 não foi executada, então dados_mensais_retificacoes pode não existir.
-- Executar esta etapa como parte da transação aprovada.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dados_mensais_retificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  motivo TEXT NOT NULL,
  solicitado_por TEXT NOT NULL,
  aprovado_por TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'retificacao_controlada',
  snapshot_antes JSONB NOT NULL,
  snapshot_depois JSONB NOT NULL,
  diff JSONB NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_retificacoes_competencia
  ON public.dados_mensais_retificacoes (unidade_id, ano, mes, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_retificacoes_created_at
  ON public.dados_mensais_retificacoes (created_at DESC);

COMMENT ON TABLE public.dados_mensais_retificacoes IS
  'Auditoria de retificações em dados_mensais. Cada registro representa uma retificação aplicada com antes/depois/diff.';


-- =============================================================================
-- 1) PRÉ-CONDIÇÃO FORTE
--
-- Só continua se o estado atual for exatamente o esperado.
-- Se divergir, a transação aborta sem alterar nada.
--
-- EXECUTAR MANUALMENTE APÓS APROVAÇÃO EXPLÍCITA.
-- =============================================================================

/*
BEGIN;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.dados_mensais
  WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND ano = 2026
    AND mes = 5
    AND alunos_ativos = 489
    AND alunos_pagantes = 463
    AND matriculas_ativas = 552
    AND matriculas_banda = 40
    AND matriculas_2_curso = 27
    AND novas_matriculas = 23
    AND evasoes = 13
    AND churn_rate = 2.81;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'ABORTADO: estado atual de CG/Maio/2026 não bate com o snapshot esperado (489/463/552/40/27/23/13/2.81). Esperado 1 linha, encontrado %. Nenhuma retificação aplicada.',
      v_count;
  END IF;
END $$;
*/


-- =============================================================================
-- 2) REGISTRAR AUDITORIA ANTES DA ALTERAÇÃO
-- =============================================================================

/*
INSERT INTO public.dados_mensais_retificacoes (
  unidade_id,
  ano,
  mes,
  motivo,
  solicitado_por,
  aprovado_por,
  origem,
  snapshot_antes,
  snapshot_depois,
  diff,
  observacoes
)
VALUES (
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  2026,
  5,
  'Restauração do snapshot validado de Maio/2026 CG após contaminação pelo cron job legado snapshot_dados_mensais_mensal às 03:00 de 01/06/2026. Fonte: old_record do audit_log.',
  'Luciano Alf',
  'Luciano Alf',
  'retificacao_controlada',
  jsonb_build_object(
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'alunos_ativos', 489,
    'alunos_pagantes', 463,
    'matriculas_ativas', 552,
    'matriculas_banda', 40,
    'matriculas_2_curso', 27,
    'novas_matriculas', 23,
    'evasoes', 13,
    'churn_rate', 2.81,
    'financeiro_alterado', false
  ),
  jsonb_build_object(
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'alunos_ativos', 496,
    'alunos_pagantes', 470,
    'matriculas_ativas', 561,
    'matriculas_banda', 41,
    'matriculas_2_curso', 27,
    'novas_matriculas', 23,
    'evasoes', 13,
    'churn_rate', 2.77,
    'financeiro_alterado', false
  ),
  jsonb_build_object(
    'alunos_ativos', jsonb_build_object('antes', 489, 'depois', 496),
    'alunos_pagantes', jsonb_build_object('antes', 463, 'depois', 470),
    'matriculas_ativas', jsonb_build_object('antes', 552, 'depois', 561),
    'matriculas_banda', jsonb_build_object('antes', 40, 'depois', 41),
    'churn_rate', jsonb_build_object('antes', 2.81, 'depois', 2.77)
  ),
  'Campos financeiros preservados: ticket_medio, faturamento_estimado, saldo_liquido, inadimplencia, taxa_renovacao, tempo_permanencia, reajuste_parcelas.'
);
*/


-- =============================================================================
-- 3) UPDATE CIRÚRGICO COM PRÉ-CONDIÇÃO DUPLA
--
-- WHERE inclui o estado atual esperado — se alguém mexeu depois, aborta.
-- Trava de segurança: exatamente 1 linha afetada.
-- =============================================================================

/*
DO $$
DECLARE
  v_linhas_afetadas INTEGER;
BEGIN
  UPDATE public.dados_mensais
  SET
    alunos_ativos = 496,
    alunos_pagantes = 470,
    matriculas_ativas = 561,
    matriculas_banda = 41,
    matriculas_2_curso = 27,
    novas_matriculas = 23,
    evasoes = 13,
    churn_rate = 2.77
  WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND ano = 2026
    AND mes = 5
    -- pré-condição dupla: garante que o estado ainda é o esperado
    AND alunos_ativos = 489
    AND alunos_pagantes = 463
    AND matriculas_ativas = 552
    AND matriculas_banda = 40
    AND matriculas_2_curso = 27
    AND novas_matriculas = 23
    AND evasoes = 13
    AND churn_rate = 2.81;

  GET DIAGNOSTICS v_linhas_afetadas = ROW_COUNT;

  IF v_linhas_afetadas = 0 THEN
    RAISE EXCEPTION
      'ABORTADO: nenhuma linha foi atualizada. O estado atual pode ter sido alterado após a pré-condição. ROLLBACK executado.';
  ELSIF v_linhas_afetadas > 1 THEN
    RAISE EXCEPTION
      'ABORTADO: UPDATE afetou % linhas, mas esperado 1. ROLLBACK executado.', v_linhas_afetadas;
  END IF;
END $$;
*/


-- =============================================================================
-- 4) COMMIT
-- =============================================================================

/*
COMMIT;
*/


-- =============================================================================
-- 5) POST-CHECK — Confirmar estado após retificação
-- =============================================================================

-- RODAR DEPOIS do COMMIT.

-- SELECT
--   id, unidade_id, ano, mes,
--   alunos_ativos, alunos_pagantes, matriculas_ativas,
--   matriculas_banda, matriculas_2_curso, novas_matriculas,
--   evasoes, churn_rate,
--   ticket_medio, faturamento_estimado, saldo_liquido,
--   inadimplencia, taxa_renovacao, tempo_permanencia, reajuste_parcelas,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;


-- =============================================================================
-- 6) VALIDAÇÃO MANUAL DO POST-CHECK
--
--   [ ] alunos_ativos = 496
--   [ ] alunos_pagantes = 470
--   [ ] matriculas_ativas = 561
--   [ ] matriculas_banda = 41
--   [ ] matriculas_2_curso = 27
--   [ ] novas_matriculas = 23
--   [ ] evasoes = 13
--   [ ] churn_rate = 2.77
--   [ ] ticket_medio NÃO mudou (preservado)
--   [ ] faturamento_estimado NÃO mudou (preservado)
--   [ ] saldo_liquido NÃO mudou (preservado)
--   [ ] inadimplencia NÃO mudou (preservado)
--   [ ] taxa_renovacao NÃO mudou (preservado)
--   [ ] tempo_permanencia NÃO mudou (preservado)
--   [ ] reajuste_parcelas NÃO mudou (preservado)
--   [ ] updated_at mudou (esperado, se houver trigger)
--   [ ] Auditoria registrada em dados_mensais_retificacoes
-- =============================================================================


-- =============================================================================
-- 7) ROLLBACK — Restaurar estado atual se necessário
-- =============================================================================

-- ROLLBACK MANUAL (executar somente se necessário):
/*
BEGIN;

DO $$
DECLARE
  v_linhas_afetadas INTEGER;
BEGIN
  UPDATE public.dados_mensais
  SET
    alunos_ativos = 489,
    alunos_pagantes = 463,
    matriculas_ativas = 552,
    matriculas_banda = 40,
    matriculas_2_curso = 27,
    novas_matriculas = 23,
    evasoes = 13,
    churn_rate = 2.81
  WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND ano = 2026
    AND mes = 5;

  GET DIAGNOSTICS v_linhas_afetadas = ROW_COUNT;

  IF v_linhas_afetadas <> 1 THEN
    RAISE EXCEPTION
      'TRAVA DE SEGURANCA: Rollback afetou % linhas, esperado 1.', v_linhas_afetadas;
  END IF;
END $$;

INSERT INTO public.dados_mensais_retificacoes (
  unidade_id, ano, mes, motivo, solicitado_por, aprovado_por, origem,
  snapshot_antes, snapshot_depois, diff, observacoes
)
VALUES (
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 2026, 5,
  'Rollback da retificação de Maio/2026 CG. Restaurado para estado pré-retificação.',
  'Luciano Alf',
  'Luciano Alf',
  'rollback',
  jsonb_build_object(
    'alunos_ativos', 496, 'alunos_pagantes', 470, 'matriculas_ativas', 561,
    'matriculas_banda', 41, 'matriculas_2_curso', 27, 'novas_matriculas', 23,
    'evasoes', 13, 'churn_rate', 2.77
  ),
  jsonb_build_object(
    'alunos_ativos', 489, 'alunos_pagantes', 463, 'matriculas_ativas', 552,
    'matriculas_banda', 40, 'matriculas_2_curso', 27, 'novas_matriculas', 23,
    'evasoes', 13, 'churn_rate', 2.81
  ),
  jsonb_build_object(
    'alunos_ativos', jsonb_build_object('antes', 496, 'depois', 489),
    'alunos_pagantes', jsonb_build_object('antes', 470, 'depois', 463),
    'matriculas_ativas', jsonb_build_object('antes', 561, 'depois', 552),
    'matriculas_banda', jsonb_build_object('antes', 41, 'depois', 40),
    'churn_rate', jsonb_build_object('antes', 2.77, 'depois', 2.81)
  ),
  'Rollback executado manualmente após decisão administrativa.'
);

COMMIT;
*/


-- =============================================================================
-- RISCOS E MITIGAÇÕES
-- =============================================================================

-- Risco 1: CREATE TABLE altera schema.
--   Mitigação: Bloco 0 é parte da proposta aprovada. Pode ser executado
--   separadamente ou como parte da transação — decisão explícita.
--
-- Risco 2: Estado atual pode ter sido alterado após a pré-condição.
--   Mitigação: Pré-condição dupla — no DO $$ e no WHERE do UPDATE.
--   Se divergir em qualquer ponto, a transação aborta.
--
-- Risco 3: UPDATE afeta 0 ou mais de 1 linha.
--   Mitigação: GET DIAGNOSTICS + RAISE EXCEPTION se <> 1.
--
-- Risco 4: Campos financeiros preservados?
--   Mitigação: UPDATE só altera campos alunos/matrículas/churn.
--   ticket_medio, faturamento, saldo, inadimplencia, renovacao, permanencia,
--   reajustes NÃO estão no SET.
--
-- Risco 5: Outras unidades afetadas?
--   Mitigação: WHERE unidade_id = '<cg>' AND ano = 2026 AND mes = 5.


-- =============================================================================
-- CHECKLIST DE EXECUÇÃO (quando aprovado)
-- =============================================================================

-- [ ] 1. Executar Bloco 0 (CREATE TABLE IF NOT EXISTS + índices)
-- [ ] 2. Rodar SELECT de PRE-CHECK e guardar resultado
-- [ ] 3. Executar transação: BEGIN → pré-condição → INSERT → UPDATE → COMMIT
-- [ ] 4. Verificar mensagem: "OK: 1 linha afetada" ou erro explícito
-- [ ] 5. Rodar POST-CHECK e comparar com PRE-CHECK
-- [ ] 6. Validar que campos financeiros NÃO mudaram
-- [ ] 7. Validar que updated_at mudou (esperado)
-- [ ] 8. Validar que Barra/Recreio NÃO foram afetados
-- [ ] 9. Documentar resultado


-- =============================================================================
-- CHECKLIST DE REVISÃO HUMANA
--
-- [ ] Pré-condição forte no estado atual esperado (489/463/552...)
-- [ ] Pré-condição dupla no WHERE do UPDATE
-- [ ] CREATE TABLE IF NOT EXISTS explícito
-- [ ] Transação com BEGIN/COMMIT e trava de segurança
-- [ ] Solicitante/aprovador: Luciano Alf
-- [ ] Só afeta CG/Maio/2026
-- [ ] Campos financeiros preservados (não no SET)
-- [ ] Rollback documentado com trava de segurança
-- [ ] Não faz backfill
-- [ ] Não afeta Barra/Recreio
-- =============================================================================
