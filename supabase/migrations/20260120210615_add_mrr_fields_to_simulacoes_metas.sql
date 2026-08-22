-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Adicionar campos para suportar modo MRR/Faturamento
ALTER TABLE simulacoes_metas 
ADD COLUMN IF NOT EXISTS tipo_objetivo TEXT DEFAULT 'alunos',
ADD COLUMN IF NOT EXISTS tipo_meta_financeira TEXT DEFAULT 'mensal',
ADD COLUMN IF NOT EXISTS mrr_objetivo NUMERIC(12,2) DEFAULT 0;

-- Comentários para documentação
COMMENT ON COLUMN simulacoes_metas.tipo_objetivo IS 'Tipo de objetivo: alunos ou mrr';
COMMENT ON COLUMN simulacoes_metas.tipo_meta_financeira IS 'Tipo de meta financeira: mensal ou anual';
COMMENT ON COLUMN simulacoes_metas.mrr_objetivo IS 'Meta de MRR quando tipo_objetivo = mrr';
