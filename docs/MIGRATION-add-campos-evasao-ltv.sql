-- ============================================================================
-- MIGRAÇÃO: Adicionar campos críticos para cálculo de LTV e MRR Perdido
-- Data: 22/01/2026
-- Objetivo: Corrigir lacunas identificadas na auditoria de KPIs
-- ============================================================================

-- Adicionar campos na tabela movimentacoes_admin
ALTER TABLE movimentacoes_admin
ADD COLUMN IF NOT EXISTS tempo_permanencia_meses INTEGER,
ADD COLUMN IF NOT EXISTS valor_parcela_evasao DECIMAL(10,2);

-- Comentários explicativos
COMMENT ON COLUMN movimentacoes_admin.tempo_permanencia_meses IS 'Tempo que o aluno permaneceu na escola (em meses) - usado para calcular LTV real';
COMMENT ON COLUMN movimentacoes_admin.valor_parcela_evasao IS 'Valor da parcela do aluno que evadiu - usado para calcular MRR Perdido';

-- Criar índice para consultas de LTV
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tempo_permanencia 
ON movimentacoes_admin(tempo_permanencia_meses) 
WHERE tipo = 'evasao' AND tempo_permanencia_meses IS NOT NULL;

-- Criar índice para consultas de MRR Perdido
CREATE INDEX IF NOT EXISTS idx_movimentacoes_valor_evasao 
ON movimentacoes_admin(valor_parcela_evasao) 
WHERE tipo = 'evasao' AND valor_parcela_evasao IS NOT NULL;

-- ============================================================================
-- INSTRUÇÕES DE USO:
-- 1. Acesse o Supabase Dashboard: https://supabase.com/dashboard
-- 2. Vá em SQL Editor
-- 3. Cole este script completo
-- 4. Execute (Run)
-- ============================================================================
