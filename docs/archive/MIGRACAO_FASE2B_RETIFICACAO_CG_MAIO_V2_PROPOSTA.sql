-- =============================================================================
-- MIGRACAO_FASE2B_RETIFICACAO_CG_MAIO_V2_PROPOSTA.sql
--
-- FASE 2B-V2 — RETIFICAÇÃO CONTROLADA: CG/MAIO/2026 (PROPOSTA)
--
-- Ajustes desta versão:
--   1. Criação segura de dados_mensais_retificacoes se não existir
--   2. Transação completa (BEGIN/ROLLBACK/COMMIT)
--   3. Trava: exatamente 1 linha afetada ou ROLLBACK
--   4. Solicitante/aprovador real (Luciano Alf)
--   5. Preservação explícita de financeiro
--   6. Documentação de updated_at (pode mudar por trigger)
--   7. Rollback para snapshot atual (489/463/552/40/27/23/13/2.81)
--
-- Fonte confiável: old_record do audit_log do cron job às 03:00 de 01/06/2026
--
-- Snapshot validado (restaurar):
--   alunos_ativos: 496, alunos_pagantes: 470, matriculas_ativas: 561,
--   matriculas_banda: 41, matriculas_2_curso: 27, novas_matriculas: 23,
--   evasoes: 13, churn_rate: 2.77
--
-- Snapshot atual (preservado para rollback):
--   alunos_ativos: 489, alunos_pagantes: 463, matriculas_ativas: 552,
--   matriculas_banda: 40, matriculas_2_curso: 27, novas_matriculas: 23,
--   evasoes: 13, churn_rate: 2.81
--
-- IMPORTANTE
--   - Modo proposta: NÃO executar sem aprovação explícita.
--   - Esta proposta NÃO altera dados_mensais até ser aprovada.
--   - Esta proposta NÃO faz backfill.
--   - Esta proposta NÃO afeta Barra/Recreio.
--   - Campos financeiros são PRESERVADOS, não sobrescritos.
-- =============================================================================


-- =============================================================================
-- 0) GARANTIR TABELA DE AUDITORIA
--
-- A Fase 2 não foi executada, então dados_mensais_retificacoes pode não existir.
-- Esta seção cria a tabela se necessário, sem alterar dados existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dados_mensais_retificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id UUID NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  solicitado_por TEXT NOT NULL,
  aprovado_por TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'retificacao_controlada',
  snapshot_antes JSONB NOT NULL,
  snapshot_depois JSONB NOT NULL,
  diff JSONB NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT dados_mensais_retificacoes_mes_ck CHECK (mes BETWEEN 1 AND 12)
);

CREATE INDEX IF NOT EXISTS idx_dm_retificacoes_competencia
  ON public.dados_mensais_retificacoes (unidade_id, ano, mes, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_retificacoes_created_at
  ON public.dados_mensais_retificacoes (created_at DESC);

COMMENT ON TABLE public.dados_mensais_retificacoes IS
  'Auditoria de retificações em dados_mensais. Cada registro representa uma retificação aplicada com antes/depois/diff.';


-- =============================================================================
-- 1) PRE-CHECK — Estado antes da retificação
-- =============================================================================

-- RODAR ANTES de qualquer operação. Guardar resultado para comparar depois.

-- SELECT
--   id,
--   unidade_id,
--   ano,
--   mes,
--   alunos_ativos,
--   alunos_pagantes,
--   matriculas_ativas,
--   matriculas_banda,
--   matriculas_2_curso,
--   novas_matriculas,
--   evasoes,
--   churn_rate,
--   ticket_medio,
--   faturamento_estimado,
--   saldo_liquido,
--   inadimplencia,
--   taxa_renovacao,
--   tempo_permanencia,
--   reajuste_parcelas,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;


-- =============================================================================
-- 2) TRANSAÇÃO DE RETIFICAÇÃO
--
-- REGRAS:
--   - BEGIN explícito
--   - INSERT na auditoria
--   - UPDATE em dados_mensais com RETURNING
--   - Verificar se exatamente 1 linha foi afetada
--   - Se 0 ou > 1: ROLLBACK
--   - Se 1: COMMIT
--
-- ATENÇÃO: Esta transação NÃO executa nada se a proposta não foi aprovada.
--   Descomente e execute manualmente após aprovação explícita.
-- =============================================================================

/*
BEGIN;

-- 2.1) Registrar auditoria antes da alteração
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
) VALUES (
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  2026,
  5,
  'Restauração de snapshot validado de Maio/2026 CG. Fonte: old_record do audit_log do cron job legado snapshot_dados_mensais_mensal às 03:00 de 01/06/2026. Campos financeiros preservados.',
  'Luciano Alf',
  'Luciano Alf',
  'retificacao_controlada',
  jsonb_build_object(
    'scope', 'ALUNOS_MATRICULAS_ONLY',
    'ano', 2026,
    'mes', 5,
    'unidade_id', '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
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
    'ano', 2026,
    'mes', 5,
    'unidade_id', '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
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
  'Financeiro PRESERVADO: ticket_medio, faturamento_estimado, saldo_liquido, inadimplencia, taxa_renovacao, tempo_permanencia, reajuste_parcelas. updated_at pode mudar por trigger.'
);

-- 2.2) UPDATE controlado em dados_mensais
-- TRAVA DE SEGURANÇA: atualizar APENAS 1 linha (CG/Maio/2026)
-- Se afetar 0 ou mais de 1, a transação deve ser revertida.

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
    AND mes = 5;

  GET DIAGNOSTICS v_linhas_afetadas = ROW_COUNT;

  IF v_linhas_afetadas <> 1 THEN
    RAISE EXCEPTION 'TRAVA DE SEGURANCA: Esperado 1 linha afetada, mas % linhas foram afetadas. ROLLBACK automatico.', v_linhas_afetadas;
  END IF;
END $$;

COMMIT;
*/


-- =============================================================================
-- 3) POST-CHECK — Confirmar estado após retificação
-- =============================================================================

-- RODAR DEPOIS da transação COMMIT. Comparar com PRE-CHECK.

-- SELECT
--   id,
--   unidade_id,
--   ano,
--   mes,
--   alunos_ativos,
--   alunos_pagantes,
--   matriculas_ativas,
--   matriculas_banda,
--   matriculas_2_curso,
--   novas_matriculas,
--   evasoes,
--   churn_rate,
--   ticket_medio,
--   faturamento_estimado,
--   saldo_liquido,
--   inadimplencia,
--   taxa_renovacao,
--   tempo_permanencia,
--   reajuste_parcelas,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;


-- =============================================================================
-- 4) VALIDAÇÃO MANUAL DO POST-CHECK
--
-- Confirmar que:
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
-- 5) ROLLBACK — Restaurar estado atual se necessário
--
-- Se algo der errado, restaurar para o snapshot contaminado atual:
--   alunos_ativos: 489, alunos_pagantes: 463, matriculas_ativas: 552,
--   matriculas_banda: 40, matriculas_2_curso: 27, novas_matriculas: 23,
--   evasoes: 13, churn_rate: 2.81
-- =============================================================================

-- ROLLBACK SQL (executar somente se necessário):
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
    RAISE EXCEPTION 'TRAVA DE SEGURANCA: Rollback afetou % linhas, esperado 1.', v_linhas_afetadas;
  END IF;
END $$;

-- Registrar rollback na auditoria
INSERT INTO public.dados_mensais_retificacoes (
  unidade_id, ano, mes, motivo, solicitado_por, aprovado_por, origem,
  snapshot_antes, snapshot_depois, diff, observacoes
) VALUES (
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
-- 6) RISCOS E MITIGAÇÕES
-- =============================================================================

-- Risco 1: Tabela dados_mensais_retificacoes pode não existir.
--   Mitigação: Bloco 0 cria a tabela se não existir (CREATE IF NOT EXISTS).
--
-- Risco 2: UPDATE pode afetar 0 ou mais de 1 linha.
--   Mitigação: Trava de segurança na transação (GET DIAGNOSTICS + RAISE).
--
-- Risco 3: Campos financeiros podem estar desatualizados.
--   Mitigação: NÃO sobrescrever. Preservar valores atuais (UPDATE sem SET).
--
-- Risco 4: Outras unidades (Barra/Recreio) podem ter sido contaminadas.
--   Mitigação: WHERE unidade_id = '<cg>' AND ano = 2026 AND mes = 5.
--
-- Risco 5: Trigger em dados_mensais pode alterar updated_at.
--   Mitigação: Documentado como comportamento esperado.
--
-- Risco 6: Se a transação falhar após INSERT em auditoria mas antes do UPDATE.
--   Mitigação: BEGIN...COMMIT garante atomicidade. Se houver erro, ROLLBACK reverte tudo.


-- =============================================================================
-- 7) CHECKLIST DE EXECUÇÃO (quando aprovado)
-- =============================================================================

-- [ ] 1. Rodar Bloco 0 (criar tabela se não existir)
-- [ ] 2. Rodar PRE-CHECK e guardar resultado
-- [ ] 3. Executar transação (Bloco 2): BEGIN → INSERT → UPDATE → COMMIT
-- [ ] 4. Verificar mensagem de sucesso ("TRAVA DE SEGURANCA: 1 linha afetada")
-- [ ] 5. Rodar POST-CHECK e comparar com PRE-CHECK
-- [ ] 6. Validar que campos financeiros NÃO mudaram
-- [ ] 7. Validar que updated_at mudou (esperado)
-- [ ] 8. Validar que Barra/Recreio NÃO foram afetados
-- [ ] 9. Documentar resultado


-- =============================================================================
-- CHECKLIST DE REVISÃO HUMANA
--
-- [ ] Arquivo marcado como PROPOSTA
-- [ ] Bloco 0 garante tabela de auditoria
-- [ ] Transação com BEGIN/COMMIT e trava de segurança
-- [ ] Solicitante/aprovador: Luciano Alf
-- [ ] Só afeta CG/Maio/2026 (WHERE preciso)
-- [ ] Campos financeiros preservados (não no SET)
-- [ ] Rollback documentado com trava de segurança
-- [ ] Não faz backfill
-- [ ] Não afeta Barra/Recreio
-- =============================================================================
