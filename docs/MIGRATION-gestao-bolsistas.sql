-- ============================================================================
-- MIGRAÇÃO: Gestão de Bolsistas
-- Data: 22/01/2026
-- Objetivo: Permitir identificação e gestão de alunos bolsistas
-- ============================================================================

-- 1. Verificar se a coluna tipo_aluno já existe na tabela alunos
-- Se não existir, será criada. Se existir, será atualizada.

DO $$ 
BEGIN
    -- Adicionar coluna tipo_aluno se não existir
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'alunos' AND column_name = 'tipo_aluno'
    ) THEN
        ALTER TABLE alunos
        ADD COLUMN tipo_aluno VARCHAR(50) DEFAULT 'pagante';
    END IF;
END $$;

-- 2. Criar constraint para validar valores permitidos
ALTER TABLE alunos
DROP CONSTRAINT IF EXISTS alunos_tipo_aluno_check;

ALTER TABLE alunos
ADD CONSTRAINT alunos_tipo_aluno_check 
CHECK (tipo_aluno IN ('pagante', 'pagante_2_curso', 'bolsista_integral', 'bolsista_parcial', 'nao_pagante'));

-- 3. Atualizar valores existentes (se necessário)
-- Por padrão, todos os alunos sem tipo_aluno definido serão marcados como 'pagante'
UPDATE alunos 
SET tipo_aluno = 'pagante' 
WHERE tipo_aluno IS NULL;

-- 4. Adicionar comentário explicativo
COMMENT ON COLUMN alunos.tipo_aluno IS 'Tipo de aluno: pagante, pagante_2_curso, bolsista_integral, bolsista_parcial, nao_pagante';

-- 5. Criar índice para consultas por tipo
CREATE INDEX IF NOT EXISTS idx_alunos_tipo_aluno 
ON alunos(tipo_aluno) 
WHERE tipo_aluno IN ('bolsista_integral', 'bolsista_parcial');

-- 6. Atualizar view vw_kpis_gestao_mensal (se necessário)
-- A view já deve estar calculando bolsistas baseado no tipo_aluno

-- ============================================================================
-- VERIFICAÇÃO: Execute para confirmar que tudo está correto
-- ============================================================================

-- Verificar estrutura da coluna
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_name = 'alunos' AND column_name = 'tipo_aluno';

-- Verificar constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'alunos_tipo_aluno_check';

-- Contar alunos por tipo
SELECT 
    tipo_aluno,
    COUNT(*) as total
FROM alunos
GROUP BY tipo_aluno
ORDER BY total DESC;

-- ============================================================================
-- INSTRUÇÕES DE USO:
-- 1. Acesse o Supabase Dashboard: https://supabase.com/dashboard
-- 2. Vá em SQL Editor
-- 3. Cole este script completo
-- 4. Execute (Run)
-- 5. Verifique os resultados das queries de verificação
-- ============================================================================
