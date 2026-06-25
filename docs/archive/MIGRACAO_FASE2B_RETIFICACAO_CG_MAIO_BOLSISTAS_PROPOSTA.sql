-- =============================================================================
-- MIGRACAO_FASE2B_RETIFICACAO_CG_MAIO_BOLSISTAS_PROPOSTA.sql
--
-- RETIFICAÇÃO DE BOLSISTAS — CG/MAIO/2026
--
-- Contexto: após retificação principal (alunos/matrículas), o snapshot ainda
-- tem bolsistas zerados. Audit forense confirmou:
--   bolsistas_integrais (snapshot atual): 0  → deveria ser: 16
--   bolsistas_parciais  (snapshot atual): 0  → deveria ser: 14
--
-- Fonte: query ao vivo em alunos (tipo_matricula_id 3/4, regra histórica)
--
-- IMPORTANTE
--   - Modo proposta: NÃO executar sem aprovação explícita.
--   - NÃO altera dados_mensais até aprovada.
--   - NÃO faz backfill.
--   - NÃO afeta Barra/Recreio.
-- =============================================================================


-- =============================================================================
-- 0) PRE-CHECK — Estado atual dos bolsistas em CG/Maio/2026
-- =============================================================================

-- SELECT
--   id, ano, mes, alunos_ativos, alunos_pagantes,
--   matriculas_ativas, bolsistas_integrais, bolsistas_parciais,
--   matriculas_banda, matriculas_2_curso,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;


-- =============================================================================
-- 1) TRANSAÇÃO DE RETIFICAÇÃO DE BOLSISTAS
--
-- REGRAS:
--   - Pré-condição: estado atual deve ser o pós-retificação principal
--     (alunos_ativos = 496, alunos_pagantes = 470, matriculas_ativas = 561)
--   - Se o estado divergiu, ABORTA
--   - UPDATE afeta exatamente 1 linha ou ABORTA
-- =============================================================================

/*
BEGIN;

-- 1.1) Pré-condição: garantir que estamos no estado correto pós-retificação principal
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
    AND alunos_ativos = 496
    AND alunos_pagantes = 470
    AND matriculas_ativas = 561
    AND matriculas_banda = 41
    AND matriculas_2_curso = 27
    AND novas_matriculas = 23
    AND evasoes = 13
    AND churn_rate = 2.77
    AND bolsistas_integrais = 0
    AND bolsistas_parciais = 0;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'ABORTADO: estado de CG/Maio/2026 não bate com o esperado pós-retificação principal (496/470/561/41/27/23/13/2.77/0/0). Esperado 1 linha, encontrado %.',
      v_count;
  END IF;
END $$;

-- 1.2) Registrar auditoria
INSERT INTO public.dados_mensais_retificacoes (
  unidade_id, ano, mes, motivo,
  solicitado_por, aprovado_por, origem,
  snapshot_antes, snapshot_depois, diff, observacoes
)
VALUES (
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
  2026,
  5,
  'Retificação de bolsistas em CG/Maio/2026. Campos bolsistas_integrais e bolsistas_parciais estavam zerados. Fonte: query ao vivo em alunos com tipo_matricula_id 3 (integral) e 4 (parcial), regra histórica data_saida > fim_mes.',
  'Luciano Alf',
  'Luciano Alf',
  'retificacao_bolsistas',
  jsonb_build_object(
    'bolsistas_integrais', 0,
    'bolsistas_parciais', 0,
    'scope', 'BOLSISTAS_ONLY'
  ),
  jsonb_build_object(
    'bolsistas_integrais', 16,
    'bolsistas_parciais', 14,
    'scope', 'BOLSISTAS_ONLY'
  ),
  jsonb_build_object(
    'bolsistas_integrais', jsonb_build_object('antes', 0, 'depois', 16),
    'bolsistas_parciais', jsonb_build_object('antes', 0, 'depois', 14)
  ),
  'Campos alunos/matrículas/financeiro preservados. Apenas bolsistas_integrais e bolsistas_parciais alterados.'
);

-- 1.3) UPDATE cirúrgico dos bolsistas
DO $$
DECLARE
  v_linhas_afetadas INTEGER;
BEGIN
  UPDATE public.dados_mensais
  SET
    bolsistas_integrais = 16,
    bolsistas_parciais = 14
  WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND ano = 2026
    AND mes = 5
    -- pré-condição: garantir estado pós-retificação principal
    AND alunos_ativos = 496
    AND alunos_pagantes = 470
    AND matriculas_ativas = 561
    AND matriculas_banda = 41
    AND matriculas_2_curso = 27
    AND novas_matriculas = 23
    AND evasoes = 13
    AND churn_rate = 2.77
    AND bolsistas_integrais = 0
    AND bolsistas_parciais = 0;

  GET DIAGNOSTICS v_linhas_afetadas = ROW_COUNT;

  IF v_linhas_afetadas = 0 THEN
    RAISE EXCEPTION 'ABORTADO: nenhuma linha atualizada. Estado pode ter divergido.';
  ELSIF v_linhas_afetadas > 1 THEN
    RAISE EXCEPTION 'ABORTADO: UPDATE afetou % linhas, esperado 1.', v_linhas_afetadas;
  END IF;
END $$;

COMMIT;
*/


-- =============================================================================
-- 2) POST-CHECK
-- =============================================================================

-- SELECT
--   id, ano, mes, alunos_ativos, alunos_pagantes,
--   matriculas_ativas, bolsistas_integrais, bolsistas_parciais,
--   matriculas_banda, matriculas_2_curso,
--   updated_at
-- FROM public.dados_mensais
-- WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
--   AND ano = 2026
--   AND mes = 5;


-- =============================================================================
-- 3) ROLLBACK
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
    bolsistas_integrais = 0,
    bolsistas_parciais = 0
  WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
    AND ano = 2026
    AND mes = 5;

  GET DIAGNOSTICS v_linhas_afetadas = ROW_COUNT;

  IF v_linhas_afetadas <> 1 THEN
    RAISE EXCEPTION 'TRAVA: Rollback afetou % linhas, esperado 1.', v_linhas_afetadas;
  END IF;
END $$;

INSERT INTO public.dados_mensais_retificacoes (
  unidade_id, ano, mes, motivo,
  solicitado_por, aprovado_por, origem,
  snapshot_antes, snapshot_depois, diff, observacoes
)
VALUES (
  '2ec861f6-023f-4d7b-9927-3960ad8c2a92', 2026, 5,
  'Rollback da retificação de bolsistas CG/Maio/2026.',
  'Luciano Alf', 'Luciano Alf', 'rollback',
  jsonb_build_object('bolsistas_integrais', 16, 'bolsistas_parciais', 14),
  jsonb_build_object('bolsistas_integrais', 0, 'bolsistas_parciais', 0),
  jsonb_build_object(
    'bolsistas_integrais', jsonb_build_object('antes', 16, 'depois', 0),
    'bolsistas_parciais', jsonb_build_object('antes', 14, 'depois', 0)
  ),
  'Rollback executado manualmente.'
);

COMMIT;
*/


-- =============================================================================
-- CHECKLIST DE REVISÃO
--
-- [ ] Pré-condição no estado pós-retificação principal (496/470/561)
-- [ ] Auditoria em dados_mensais_retificacoes
-- [ ] UPDATE de exatamente 1 linha
-- [ ] Só altera bolsistas_integrais e bolsistas_parciais
-- [ ] Não altera alunos/matrículas/financeiro
-- [ ] Rollback documentado
-- =============================================================================
