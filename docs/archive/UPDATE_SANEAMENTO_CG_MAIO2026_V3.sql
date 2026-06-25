-- ============================================================
-- UPDATES COM GUARDS v3 — Campo Grande / Maio 2026
-- NÃO EXECUTAR SEM APROVAÇÃO DO ALF
-- ============================================================
-- CHECKLIST:
-- [ ] 1. Rodar SIMULACAO_SANEAMENTO_CG_MAIO2026_V3.sql primeiro
-- [ ] 2. Confirmar Alf aprova estes guards exatos
-- [ ] 3. Descomentar e executar o DO $$ abaixo
-- [ ] 4. Validar com SELECT * FROM alunos WHERE id IN (...)
-- [ ] 5. Só então: atualizar recalcular_dados_mensais + executar RPC
-- [ ] 6. NÃO backfill Jan-Abr. NÃO rodar Barra/Recreio ainda.
-- ============================================================

/*
DO $$
DECLARE
  v_count integer;
  v_unidade UUID := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
BEGIN
  RAISE NOTICE '=== SANEAMENTO CG/MAIO 2026 v3 ===';
  RAISE NOTICE 'Unidade: %', v_unidade;

  -- ============================================================
  -- GRUPO A (16): preencher data_saida — GUARD: inativo, sem data_saida
  -- ASSERT: exatamente 16 rows afetadas
  -- ============================================================
  UPDATE alunos
  SET data_saida = '2026-03-05', updated_at = NOW()
  WHERE id = 106 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-25', updated_at = NOW()
  WHERE id = 85  AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-01', updated_at = NOW()
  WHERE id = 94  AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-03-03', updated_at = NOW()
  WHERE id = 131 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-05-07', updated_at = NOW()
  WHERE id = 137 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-05-04', updated_at = NOW()
  WHERE id = 149 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-11', updated_at = NOW()
  WHERE id = 165 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-02', updated_at = NOW()
  WHERE id = 224 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-05-06', updated_at = NOW()
  WHERE id = 258 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-02', updated_at = NOW()
  WHERE id = 270 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-03-06', updated_at = NOW()
  WHERE id = 327 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-03-06', updated_at = NOW()
  WHERE id = 354 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-10', updated_at = NOW()
  WHERE id = 384 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-03-14', updated_at = NOW()
  WHERE id = 11  AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-03-23', updated_at = NOW()
  WHERE id = 118 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-04-01', updated_at = NOW()
  WHERE id = 1377 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 16 THEN
    RAISE EXCEPTION 'GRUPO A: esperado 16 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo A: % registros OK', v_count;

  -- ============================================================
  -- GRUPO B (1): status='inativo' — GUARD: ativo, data_saida='2026-01-09'
  -- MANTER data_saida atual. NÃO limpar.
  -- ASSERT: exatamente 1 row
  -- ============================================================
  UPDATE alunos
  SET status = 'inativo', updated_at = NOW()
  WHERE id = 47
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida = '2026-01-09';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'GRUPO B: esperado 1 update, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo B (Arthur): % registro OK', v_count;

  -- ============================================================
  -- GRUPO C (5): limpar data_saida — GUARD por data_saida esperada
  -- ASSERT: exatamente 5 rows
  -- ============================================================
  UPDATE alunos
  SET data_saida = NULL, updated_at = NOW()
  WHERE id = 31
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida = '2026-02-24';

  UPDATE alunos
  SET data_saida = NULL, updated_at = NOW()
  WHERE id = 263
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida = '2026-03-02';

  UPDATE alunos
  SET data_saida = NULL, updated_at = NOW()
  WHERE id = 405
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida = '2026-02-05';

  UPDATE alunos
  SET data_saida = NULL, updated_at = NOW()
  WHERE id = 323
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida = '2026-02-02';

  UPDATE alunos
  SET data_saida = NULL, updated_at = NOW()
  WHERE id = 949
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida = '2026-02-14';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'GRUPO C: esperado 5 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo C: % registros OK', v_count;

  -- ============================================================
  -- GRUPO D (2): não matriculadas — GUARD: inativo, sem data_saida
  -- ASSERT: exatamente 2 rows
  -- ============================================================
  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 1450
    AND unidade_id = v_unidade
    AND status = 'inativo'
    AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 1378
    AND unidade_id = v_unidade
    AND status = 'inativo'
    AND data_saida IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'GRUPO D: esperado 2 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo D: % registros OK', v_count;

  -- ============================================================
  -- GRUPO E (2): excluídos — GUARD: inativo, sem data_saida
  -- ASSERT: exatamente 2 rows
  -- ============================================================
  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 945
    AND unidade_id = v_unidade
    AND status = 'inativo'
    AND data_saida IS NULL;

  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 1598
    AND unidade_id = v_unidade
    AND status = 'inativo'
    AND data_saida IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'GRUPO E: esperado 2 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo E: % registros OK', v_count;

  RAISE NOTICE '=== SANEAMENTO CONCLUÍDO ===';
  RAISE NOTICE 'Total updates: A=16 + B=1 + C=5 + D=2 + E=2 = 26';
END $$;
*/
