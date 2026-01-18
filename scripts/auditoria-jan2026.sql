-- ============================================
-- AUDITORIA: Matrículas Vazadas em Janeiro/2026
-- Execute estas queries no Supabase Dashboard > SQL Editor
-- ============================================

-- 1. VERIFICAR STATUS E DADOS COMPLETOS DOS 7 ALUNOS
-- Isso mostra se estão ativos, evadidos, quando foram criados, etc.
SELECT 
  id,
  nome,
  status,
  data_matricula,
  data_evasao,
  created_at,
  updated_at,
  valor_parcela,
  unidade_id,
  curso_id,
  professor_atual_id,
  professor_experimental_id
FROM alunos
WHERE id IN (569, 387, 293, 160, 216, 760, 861)
ORDER BY data_matricula;

-- ============================================

-- 2. VERIFICAR SE ESSES ALUNOS CONTAM NO TOTAL DE ATIVOS
-- Se status = 'ativo', eles estão sendo contados nas métricas
SELECT 
  status,
  COUNT(*) as quantidade
FROM alunos
WHERE id IN (569, 387, 293, 160, 216, 760, 861)
GROUP BY status;

-- ============================================

-- 3. VERIFICAR QUANDO ESSES REGISTROS FORAM CRIADOS
-- Isso ajuda a entender se foram importados errado ou criados manualmente
SELECT 
  id,
  nome,
  data_matricula,
  created_at::date as data_criacao_registro,
  CASE 
    WHEN created_at::date = data_matricula THEN 'Criado no mesmo dia da matrícula'
    WHEN created_at::date < data_matricula THEN 'Registro criado ANTES da matrícula (suspeito)'
    ELSE 'Registro criado DEPOIS da matrícula (importação retroativa)'
  END as analise
FROM alunos
WHERE id IN (569, 387, 293, 160, 216, 760, 861)
ORDER BY created_at;

-- ============================================

-- 4. VERIFICAR TOTAL DE ALUNOS ATIVOS POR UNIDADE (ATUAL)
-- Para comparar antes e depois da correção
SELECT 
  u.nome as unidade,
  COUNT(*) as total_ativos
FROM alunos a
JOIN unidades u ON a.unidade_id = u.id
WHERE a.status = 'ativo'
GROUP BY u.nome
ORDER BY u.nome;

-- ============================================

-- 5. VERIFICAR SE EXISTEM MAIS MATRÍCULAS EM 2026
-- Para garantir que não há outros dados vazados
SELECT 
  EXTRACT(YEAR FROM data_matricula) as ano,
  EXTRACT(MONTH FROM data_matricula) as mes,
  COUNT(*) as total_matriculas
FROM alunos
WHERE EXTRACT(YEAR FROM data_matricula) >= 2026
GROUP BY EXTRACT(YEAR FROM data_matricula), EXTRACT(MONTH FROM data_matricula)
ORDER BY ano, mes;

-- ============================================

-- 6. VERIFICAR ÚLTIMA MATRÍCULA VÁLIDA (DEZ/2025)
SELECT 
  MAX(data_matricula) as ultima_matricula_valida
FROM alunos
WHERE EXTRACT(YEAR FROM data_matricula) = 2025;

-- ============================================

-- 7. SIMULAR IMPACTO DA CORREÇÃO
-- Mostra quantos alunos ativos seriam afetados por unidade
SELECT 
  u.nome as unidade,
  COUNT(*) as alunos_afetados
FROM alunos a
JOIN unidades u ON a.unidade_id = u.id
WHERE a.id IN (569, 387, 293, 160, 216, 760, 861)
  AND a.status = 'ativo'
GROUP BY u.nome;

-- ============================================
-- OPÇÕES DE CORREÇÃO (NÃO EXECUTE AINDA!)
-- ============================================

-- OPÇÃO A: Corrigir data para 31/12/2025 (MAIS SEGURO)
-- UPDATE alunos
-- SET data_matricula = '2025-12-31'
-- WHERE id IN (569, 387, 293, 160, 216, 760, 861);

-- OPÇÃO B: Deletar registros (APENAS se confirmou que são dados de teste)
-- DELETE FROM alunos
-- WHERE id IN (569, 387, 293, 160, 216, 760, 861);
