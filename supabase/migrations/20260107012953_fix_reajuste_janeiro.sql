-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir reajuste de Janeiro para todas as unidades (planilha tinha "-")
UPDATE dados_mensais SET reajuste_parcelas = 0 
WHERE ano = 2025 AND mes = 1;

-- Corrigir reajuste de Dezembro para Campo Grande (planilha tinha "-")
UPDATE dados_mensais SET reajuste_parcelas = 0 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 12;
