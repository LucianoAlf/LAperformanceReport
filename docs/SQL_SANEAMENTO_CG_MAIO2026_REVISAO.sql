-- ============================================================
-- SANEAMENTO DE CICLO DE VIDA — Campo Grande / Maio 2026
-- MODO REVISÃO — NÃO EXECUTAR SEM APROVAÇÃO DO ALF
-- ============================================================
-- Geração: 31/05/2026
-- Contexto: Corrigir 28 alunos antes de rodar recalcular_dados_mensais v2
-- Regra nova: excluir cursos.is_projeto_banda de alunos_ativos/alunos_pagantes
--
-- CHECKLIST DE EXECUÇÃO:
-- [ ] 1. Validar preview com: SELECT * FROM preview_saneamento;
-- [ ] 2. Confirmar Alf aprova
-- [ ] 3. Executar updates (descomentar DO block)
-- [ ] 4. Verificar com: SELECT * FROM validacao_pos_update;
-- [ ] 5. Só então: SELECT recalcular_dados_mensais(2026, 5, '2ec861f6-023f-4d7b-9927-3960ad8c2a92');
-- [ ] 6. NÃO rodar backfill Jan-Abr, Barra ou Recreio ainda
-- ============================================================

-- ============================================================
-- 0. PREVIEW: ver antes de aplicar (READ-ONLY)
-- ============================================================
DROP VIEW IF EXISTS preview_saneamento;
CREATE OR REPLACE VIEW preview_saneamento AS
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
),
correcoes(id, nova_data_saida, novo_status, grupo, descricao) AS (
  -- GRUPO A (16): preencher data_saida
  SELECT 106,  '2026-03-05'::date, NULL, 'A', 'Emily'
  UNION ALL SELECT 85,  '2026-04-25', NULL, 'A', 'Davi Borges'
  UNION ALL SELECT 94,  '2026-04-01', NULL, 'A', 'Davi Rosendo'
  UNION ALL SELECT 131, '2026-03-03', NULL, 'A', 'Gabriel'
  UNION ALL SELECT 137, '2026-05-07', NULL, 'A', 'Georgie'
  UNION ALL SELECT 149, '2026-05-04', NULL, 'A', 'Guilherme'
  UNION ALL SELECT 165, '2026-04-11', NULL, 'A', 'Heitor'
  UNION ALL SELECT 224, '2026-04-02', NULL, 'A', 'Laura'
  UNION ALL SELECT 258, '2026-05-06', NULL, 'A', 'Luís Rafael'
  UNION ALL SELECT 270, '2026-04-02', NULL, 'A', 'Manuela'
  UNION ALL SELECT 327, '2026-03-06', NULL, 'A', 'Murilo'
  UNION ALL SELECT 354, '2026-03-06', NULL, 'A', 'Pedro'
  UNION ALL SELECT 384, '2026-04-10', NULL, 'A', 'Sophia'
  UNION ALL SELECT 11,  '2026-03-14', NULL, 'A', 'Alexandre Wallace'
  UNION ALL SELECT 118, '2026-03-23', NULL, 'A', 'Felipe'
  UNION ALL SELECT 1377,'2026-04-01', NULL, 'A', 'Alexandre Serra'
  -- GRUPO B (1): status='inativo', manter data_saida
  UNION ALL SELECT 47,  NULL, 'inativo', 'B', 'Arthur'
  -- GRUPO C (5): limpar data_saida
  UNION ALL SELECT 31,  NULL, NULL, 'C', 'Anne'
  UNION ALL SELECT 263, NULL, NULL, 'C', 'Luiza'
  UNION ALL SELECT 405, NULL, NULL, 'C', 'Vicente'
  UNION ALL SELECT 323, NULL, NULL, 'C', 'Miguel'
  UNION ALL SELECT 949, NULL, NULL, 'C', 'Cassyo'
  -- GRUPO E (2): corte técnico
  UNION ALL SELECT 945, '2026-05-31', NULL, 'E', 'Luciano'
  UNION ALL SELECT 1598,'2026-05-31', NULL, 'E', 'Alexandre Dos Santos'
)
SELECT 
  c.grupo,
  a.id,
  a.nome,
  a.status AS status_atual,
  c.novo_status AS status_novo,
  a.data_saida AS data_saida_atual,
  CASE 
    WHEN c.grupo = 'B' THEN a.data_saida  -- manter
    WHEN c.nova_data_saida IS NOT NULL THEN c.nova_data_saida
    WHEN c.id IS NOT NULL THEN NULL  -- explicitamente NULL para C
    ELSE a.data_saida
  END AS data_saida_nova,
  tm.nome AS tipo_matricula,
  tm.conta_como_pagante
FROM correcoes c
JOIN alunos a ON a.id = c.id
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
ORDER BY c.grupo, a.id;

-- Para visualizar: SELECT * FROM preview_saneamento;


-- ============================================================
-- 1. UPDATES (DESCOMENTAR E EXECUTAR APÓS APROVAÇÃO)
-- ============================================================
/*
DO $$
DECLARE
  v_count integer;
BEGIN
  RAISE NOTICE '=== INICIANDO SANEAMENTO CG/MAIO 2026 ===';

  -- GRUPO A: preencher data_saida (16 casos)
  UPDATE alunos SET data_saida = '2026-03-05',  updated_at = NOW() WHERE id = 106;
  UPDATE alunos SET data_saida = '2026-04-25', updated_at = NOW() WHERE id = 85;
  UPDATE alunos SET data_saida = '2026-04-01', updated_at = NOW() WHERE id = 94;
  UPDATE alunos SET data_saida = '2026-03-03', updated_at = NOW() WHERE id = 131;
  UPDATE alunos SET data_saida = '2026-05-07', updated_at = NOW() WHERE id = 137;
  UPDATE alunos SET data_saida = '2026-05-04', updated_at = NOW() WHERE id = 149;
  UPDATE alunos SET data_saida = '2026-04-11', updated_at = NOW() WHERE id = 165;
  UPDATE alunos SET data_saida = '2026-04-02', updated_at = NOW() WHERE id = 224;
  UPDATE alunos SET data_saida = '2026-05-06', updated_at = NOW() WHERE id = 258;
  UPDATE alunos SET data_saida = '2026-04-02', updated_at = NOW() WHERE id = 270;
  UPDATE alunos SET data_saida = '2026-03-06', updated_at = NOW() WHERE id = 327;
  UPDATE alunos SET data_saida = '2026-03-06', updated_at = NOW() WHERE id = 354;
  UPDATE alunos SET data_saida = '2026-04-10', updated_at = NOW() WHERE id = 384;
  UPDATE alunos SET data_saida = '2026-03-14', updated_at = NOW() WHERE id = 11;
  UPDATE alunos SET data_saida = '2026-03-23', updated_at = NOW() WHERE id = 118;
  UPDATE alunos SET data_saida = '2026-04-01', updated_at = NOW() WHERE id = 1377;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Grupo A aplicado: % registros', v_count;

  -- GRUPO B: status='inativo', manter data_saida (1 caso)
  UPDATE alunos SET status = 'inativo', updated_at = NOW() WHERE id = 47;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Grupo B aplicado: % registros', v_count;

  -- GRUPO C: limpar data_saida (5 casos)
  UPDATE alunos SET data_saida = NULL, updated_at = NOW() WHERE id IN (31, 263, 405, 323, 949);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Grupo C aplicado: % registros', v_count;

  -- GRUPO E: corte técnico (2 casos)
  UPDATE alunos SET data_saida = '2026-05-31', updated_at = NOW() WHERE id IN (945, 1598);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Grupo E aplicado: % registros', v_count;

  RAISE NOTICE '=== SANEAMENTO CONCLUÍDO ===';
END $$;
*/

-- ============================================================
-- 2. VALIDAÇÃO PÓS-UPDATE (EXECUTAR DEPOIS DOS UPDATES)
-- ============================================================
DROP VIEW IF EXISTS validacao_pos_update;
CREATE OR REPLACE VIEW validacao_pos_update AS
WITH fim_mes AS (
  SELECT (DATE_TRUNC('month', MAKE_DATE(2026, 5, 1)) + INTERVAL '1 month - 1 day')::DATE AS dt
)
SELECT 
  'alunos_ativos' AS metrica,
  COUNT(*) AS valor
FROM alunos
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND COALESCE(is_segundo_curso, false) = false
  AND data_matricula <= (SELECT dt FROM fim_mes)
  AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))

UNION ALL

SELECT 
  'alunos_pagantes',
  COUNT(*)
FROM alunos a
LEFT JOIN tipos_matricula tm ON tm.id = a.tipo_matricula_id
WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND COALESCE(a.is_segundo_curso, false) = false
  AND a.data_matricula <= (SELECT dt FROM fim_mes)
  AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
  AND (tm.conta_como_pagante = true OR tm.id IS NULL)

UNION ALL

SELECT 'matriculas_ativas', COUNT(*)
FROM alunos
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND data_matricula <= (SELECT dt FROM fim_mes)
  AND (data_saida IS NULL OR data_saida > (SELECT dt FROM fim_mes))

UNION ALL

SELECT 'matriculas_banda', COUNT(*)
FROM alunos a
LEFT JOIN cursos c ON c.id = a.curso_id
WHERE a.unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92'
  AND a.data_matricula <= (SELECT dt FROM fim_mes)
  AND (a.data_saida IS NULL OR a.data_saida > (SELECT dt FROM fim_mes))
  AND c.is_projeto_banda = true;

-- Para validar: SELECT * FROM validacao_pos_update;
