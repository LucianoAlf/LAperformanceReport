-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar coluna fator_demanda na tabela cursos
ALTER TABLE cursos 
ADD COLUMN IF NOT EXISTS fator_demanda DECIMAL(2,1) DEFAULT 1.0;

-- Adicionar constraint para valores permitidos
ALTER TABLE cursos
ADD CONSTRAINT cursos_fator_demanda_check 
CHECK (fator_demanda IN (1.0, 1.5, 2.0, 2.5, 3.0));

-- Comentário explicativo
COMMENT ON COLUMN cursos.fator_demanda IS 'Fator de demanda para Health Score (1.0=curso grande, 3.0=curso pequeno). Valores: 1.0, 1.5, 2.0, 2.5, 3.0';
