-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar reajustes da Barra (Ago-Dez/25)
UPDATE dados_mensais 
SET reajuste_parcelas = 9.5 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 8;

UPDATE dados_mensais 
SET reajuste_parcelas = 9.5 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 9;

UPDATE dados_mensais 
SET reajuste_parcelas = 7.8 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 10;

UPDATE dados_mensais 
SET reajuste_parcelas = 8.9 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 11;

UPDATE dados_mensais 
SET reajuste_parcelas = 10.9 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 12;

-- Atualizar reajuste de Campo Grande (Nov/25) - CSV mostra 9.90%
UPDATE dados_mensais 
SET reajuste_parcelas = 9.90 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 11;

-- Atualizar reajuste de Recreio (Dez/25) - CSV mostra 10.85%
UPDATE dados_mensais 
SET reajuste_parcelas = 10.85 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 12;
