-- ============================================================
-- UPDATES COM GUARDS — Campo Grande / Maio 2026
-- NÃO EXECUTAR SEM APROVAÇÃO DO ALF
-- ============================================================
-- CHECKLIST:
-- [ ] 1. Rodar SIMULACAO_SANEAMENTO_CG_MAIO2026.sql primeiro
-- [ ] 2. Confirmar Alf aprova estes guards exatos
-- [ ] 3. Descomentar e executar o DO $$ abaixo
-- [ ] 4. Validar com SELECT * FROM alunos WHERE id IN (...)
-- [ ] 5. Só então: recalcular_dados_mensais(2026, 5, Campo Grande)
-- [ ] 6. NÃO backfill Jan-Abr. NÃO rodar Barra/Recreio ainda.
-- ============================================================

/*
DO $$
DECLARE
  v_count integer;
  v_unidade UUID := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
BEGIN
  RAISE NOTICE '=== SANEAMENTO CG/MAIO 2026 ===';
  RAISE NOTICE 'Unidade: %', v_unidade;

  -- ============================================================
  -- GRUPO A (16): preencher data_saida — GUARD: inativo, sem data_saida
  -- ============================================================
  UPDATE alunos
  SET data_saida = '2026-03-05',  updated_at = NOW()
  WHERE id = 106 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A1 Emily (id=106): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-25', updated_at = NOW()
  WHERE id = 85  AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A2 Davi Borges (id=85): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-01', updated_at = NOW()
  WHERE id = 94  AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A3 Davi Rosendo (id=94): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-03-03', updated_at = NOW()
  WHERE id = 131 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A4 Gabriel (id=131): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-05-07', updated_at = NOW()
  WHERE id = 137 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A5 Georgie (id=137): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-05-04', updated_at = NOW()
  WHERE id = 149 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A6 Guilherme (id=149): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-11', updated_at = NOW()
  WHERE id = 165 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A7 Heitor (id=165): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-02', updated_at = NOW()
  WHERE id = 224 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A8 Laura (id=224): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-05-06', updated_at = NOW()
  WHERE id = 258 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A9 Luís Rafael (id=258): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-02', updated_at = NOW()
  WHERE id = 270 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A10 Manuela (id=270): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-03-06', updated_at = NOW()
  WHERE id = 327 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A11 Murilo (id=327): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-03-06', updated_at = NOW()
  WHERE id = 354 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A12 Pedro (id=354): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-10', updated_at = NOW()
  WHERE id = 384 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A13 Sophia (id=384): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-03-14', updated_at = NOW()
  WHERE id = 11  AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A14 Alexandre Wallace (id=11): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-03-23', updated_at = NOW()
  WHERE id = 118 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A15 Felipe (id=118): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-04-01', updated_at = NOW()
  WHERE id = 1377 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'A16 Alexandre Serra (id=1377): % rows', v_count;

  -- ============================================================
  -- GRUPO B (1): status='inativo' — GUARD: ativo, data_saida='2026-01-09'
  -- ============================================================
  UPDATE alunos
  SET status = 'inativo', updated_at = NOW()
  WHERE id = 47 AND unidade_id = v_unidade AND status = 'ativo' AND data_saida = '2026-01-09';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'B Arthur (id=47): % rows', v_count;

  -- ============================================================
  -- GRUPO C (5): limpar data_saida — GUARD: ativo, data_saida preenchida
  -- ============================================================
  UPDATE alunos
  SET data_saida = NULL, updated_at = NOW()
  WHERE id IN (31, 263, 405, 323, 949)
    AND unidade_id = v_unidade
    AND status = 'ativo'
    AND data_saida IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'C ativos confirmados (31,263,405,323,949): % rows', v_count;

  -- ============================================================
  -- GRUPO D (2): não matriculadas — GUARD: inativo, sem data_saida
  -- ============================================================
  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 1450 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'D1 Maria Eduarda (id=1450): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 1378 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'D2 Ana Julia (id=1378): % rows', v_count;

  -- ============================================================
  -- GRUPO E (2): excluídos/não matriculados — GUARD: inativo, sem data_saida
  -- ============================================================
  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 945 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'E1 Luciano (id=945): % rows', v_count;

  UPDATE alunos
  SET data_saida = '2026-05-31', updated_at = NOW()
  WHERE id = 1598 AND unidade_id = v_unidade AND status = 'inativo' AND data_saida IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'E2 Alexandre Dos Santos (id=1598): % rows', v_count;

  RAISE NOTICE '=== SANEAMENTO CONCLUÍDO ===';
END $$;
*/
