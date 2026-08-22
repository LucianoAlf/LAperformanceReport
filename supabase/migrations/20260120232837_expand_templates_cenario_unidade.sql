-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Adicionar campos para todos os parâmetros do simulador
ALTER TABLE templates_cenario_unidade 
ADD COLUMN IF NOT EXISTS ticket_medio DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS churn_projetado DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS taxa_lead_exp DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS taxa_exp_mat DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS mrr_objetivo DECIMAL(12,2);
