-- ============================================================
-- UPDATES COM GUARDS v4 — Campo Grande / Maio 2026
-- NÃO EXECUTAR SEM APROVAÇÃO DO ALF
-- ============================================================
-- CHECKLIST (APROVADO):
-- [ ] 1. Rodar SIMULACAO_SANEAMENTO_CG_MAIO2026_V4.sql primeiro
-- [ ] 2. Descomentar e executar o DO $$ abaixo
-- [ ] 3. Validar com SELECT * FROM alunos WHERE id IN (...)
--
-- NÃO APROVADO — aguardar auditoria SQL/migration:
-- [ ] Atualizar recalcular_dados_mensais
-- [ ] Executar recalcular_dados_mensais(2026, 5, Campo Grande)
-- [ ] Backfill Jan-Abr
-- [ ] Barra/Recreio
-- ============================================================

/*
DO $$
DECLARE
  v_count integer;
  v_unidade UUID := '2ec861f6-023f-4d7b-9927-3960ad8c2a92';
BEGIN
  RAISE NOTICE '=== SANEAMENTO CG/MAIO 2026 v4 ===';
  RAISE NOTICE 'Unidade: %', v_unidade;

  -- ============================================================
  -- GRUPO A (16): preencher data_saida — GUARD: inativo, sem data_saida
  -- ASSERT: exatamente 16 rows afetadas
  -- ============================================================
  WITH updated AS (
    UPDATE alunos a
    SET data_saida = v.nova_data_saida, updated_at = NOW()
    FROM (VALUES
      (106, '2026-03-05'::date),
      (85,  '2026-04-25'),
      (94,  '2026-04-01'),
      (131, '2026-03-03'),
      (137, '2026-05-07'),
      (149, '2026-05-04'),
      (165, '2026-04-11'),
      (224, '2026-04-02'),
      (258, '2026-05-06'),
      (270, '2026-04-02'),
      (327, '2026-03-06'),
      (354, '2026-03-06'),
      (384, '2026-04-10'),
      (11,  '2026-03-14'),
      (118, '2026-03-23'),
      (1377,'2026-04-01')
    ) AS v(id, nova_data_saida)
    WHERE a.id = v.id
      AND a.unidade_id = v_unidade
      AND a.status = 'inativo'
      AND a.data_saida IS NULL
    RETURNING a.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  IF v_count != 16 THEN
    RAISE EXCEPTION 'GRUPO A: esperado 16 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo A: % registros OK', v_count;

  -- ============================================================
  -- GRUPO B (1): status='inativo' — GUARD: ativo, data_saida='2026-01-09'
  -- MANTER data_saida atual. NÃO limpar.
  -- ASSERT: exatamente 1 row
  -- ============================================================
  WITH updated AS (
    UPDATE alunos
    SET status = 'inativo', updated_at = NOW()
    WHERE id = 47
      AND unidade_id = v_unidade
      AND status = 'ativo'
      AND data_saida = '2026-01-09'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'GRUPO B: esperado 1 update, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo B (Arthur): % registro OK', v_count;

  -- ============================================================
  -- GRUPO C (5): limpar data_saida — GUARD por data_saida esperada por ID
  -- ASSERT: exatamente 5 rows
  -- ============================================================
  WITH updated AS (
    UPDATE alunos a
    SET data_saida = NULL, updated_at = NOW()
    FROM (VALUES
      (31,  '2026-02-24'::date),
      (263, '2026-03-02'),
      (405, '2026-02-05'),
      (323, '2026-02-02'),
      (949, '2026-02-14')
    ) AS v(id, data_saida_esperada)
    WHERE a.id = v.id
      AND a.unidade_id = v_unidade
      AND a.status = 'ativo'
      AND a.data_saida = v.data_saida_esperada
    RETURNING a.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  IF v_count != 5 THEN
    RAISE EXCEPTION 'GRUPO C: esperado 5 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo C: % registros OK', v_count;

  -- ============================================================
  -- GRUPO D (2): não matriculadas — GUARD: inativo, sem data_saida
  -- ASSERT: exatamente 2 rows
  -- ============================================================
  WITH updated AS (
    UPDATE alunos a
    SET data_saida = '2026-05-31', updated_at = NOW()
    FROM (VALUES (1450), (1378)) AS v(id)
    WHERE a.id = v.id
      AND a.unidade_id = v_unidade
      AND a.status = 'inativo'
      AND a.data_saida IS NULL
    RETURNING a.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'GRUPO D: esperado 2 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo D: % registros OK', v_count;

  -- ============================================================
  -- GRUPO E (2): excluídos — GUARD: inativo, sem data_saida
  -- ASSERT: exatamente 2 rows
  -- ============================================================
  WITH updated AS (
    UPDATE alunos a
    SET data_saida = '2026-05-31', updated_at = NOW()
    FROM (VALUES (945), (1598)) AS v(id)
    WHERE a.id = v.id
      AND a.unidade_id = v_unidade
      AND a.status = 'inativo'
      AND a.data_saida IS NULL
    RETURNING a.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;
  IF v_count != 2 THEN
    RAISE EXCEPTION 'GRUPO E: esperado 2 updates, obtido %', v_count;
  END IF;
  RAISE NOTICE 'Grupo E: % registros OK', v_count;

  RAISE NOTICE '=== SANEAMENTO CONCLUÍDO ===';
  RAISE NOTICE 'Total updates: A=16 + B=1 + C=5 + D=2 + E=2 = 26';
END $$;
*/
