-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campos entra_ltv e entra_churn em tipos_matricula
ALTER TABLE tipos_matricula 
ADD COLUMN IF NOT EXISTS entra_ltv BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS entra_churn BOOLEAN DEFAULT true;

-- Atualizar bolsistas e banda para não entrar nos cálculos
UPDATE tipos_matricula 
SET entra_ltv = false, entra_churn = false 
WHERE codigo IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA');

-- Comentário nos campos
COMMENT ON COLUMN tipos_matricula.entra_ltv IS 'Se este tipo de matrícula entra no cálculo de LTV';
COMMENT ON COLUMN tipos_matricula.entra_churn IS 'Se este tipo de matrícula entra no cálculo de Churn';
