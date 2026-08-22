-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar coluna contexto para suportar tarefas multi-página
ALTER TABLE farmer_tarefas
ADD COLUMN IF NOT EXISTS contexto VARCHAR(20) NOT NULL DEFAULT 'farmer';

-- Constraint para valores válidos
ALTER TABLE farmer_tarefas
ADD CONSTRAINT farmer_tarefas_contexto_check
CHECK (contexto IN ('farmer', 'comercial', 'pre_atendimento'));

-- Índice composto para queries filtradas por contexto
CREATE INDEX IF NOT EXISTS idx_farmer_tarefas_contexto
ON farmer_tarefas (contexto, unidade_id, concluida);
