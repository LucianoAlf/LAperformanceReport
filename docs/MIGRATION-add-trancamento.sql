-- ============================================================================
-- MIGRAÇÃO: Adicionar suporte a Trancamentos
-- Data: 22/01/2026
-- Objetivo: Permitir registro de trancamentos na página Administrativa
-- ============================================================================

-- Atualizar constraint do tipo para incluir 'trancamento'
ALTER TABLE movimentacoes_admin
DROP CONSTRAINT IF EXISTS movimentacoes_admin_tipo_check;

ALTER TABLE movimentacoes_admin
ADD CONSTRAINT movimentacoes_admin_tipo_check 
CHECK (tipo IN ('renovacao', 'nao_renovacao', 'aviso_previo', 'evasao', 'trancamento'));

-- Adicionar campos específicos para trancamento
ALTER TABLE movimentacoes_admin
ADD COLUMN IF NOT EXISTS previsao_retorno DATE;

-- Comentário explicativo
COMMENT ON COLUMN movimentacoes_admin.previsao_retorno IS 'Data prevista de retorno do aluno (usado em trancamentos)';

-- Criar índice para consultas de trancamentos
CREATE INDEX IF NOT EXISTS idx_movimentacoes_trancamento 
ON movimentacoes_admin(tipo, data) 
WHERE tipo = 'trancamento';

-- ============================================================================
-- INSTRUÇÕES DE USO:
-- 1. Acesse o Supabase Dashboard: https://supabase.com/dashboard
-- 2. Vá em SQL Editor
-- 3. Cole este script completo
-- 4. Execute (Run)
-- ============================================================================
