-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Atualizar inadimplência para Campo Grande 2025
UPDATE dados_mensais SET inadimplencia = 0.25 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 1;

UPDATE dados_mensais SET inadimplencia = 0.17 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 2;

UPDATE dados_mensais SET inadimplencia = 0.20 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 3;

UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 4;

UPDATE dados_mensais SET inadimplencia = 0.73 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 5;

UPDATE dados_mensais SET inadimplencia = 1.35 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 6;

UPDATE dados_mensais SET inadimplencia = 2.64 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 7;

UPDATE dados_mensais SET inadimplencia = 0.18 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 8;

UPDATE dados_mensais SET inadimplencia = 1.57 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 9;

UPDATE dados_mensais SET inadimplencia = 1.53 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 10;

UPDATE dados_mensais SET inadimplencia = 1.67 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 11;

UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 12;

-- Atualizar inadimplência para Recreio 2025
UPDATE dados_mensais SET inadimplencia = 3.36 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 1;

UPDATE dados_mensais SET inadimplencia = 0.80 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 2;

UPDATE dados_mensais SET inadimplencia = 0.82 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 3;

UPDATE dados_mensais SET inadimplencia = 0.76 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 4;

UPDATE dados_mensais SET inadimplencia = 0.76 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 5;

UPDATE dados_mensais SET inadimplencia = 1.50 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 6;

UPDATE dados_mensais SET inadimplencia = 1.16 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 7;

UPDATE dados_mensais SET inadimplencia = 0.74 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 8;

UPDATE dados_mensais SET inadimplencia = 1.08 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 9;

UPDATE dados_mensais SET inadimplencia = 1.42 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 10;

UPDATE dados_mensais SET inadimplencia = 1.81 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 11;

UPDATE dados_mensais SET inadimplencia = 1.12 
WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 12;

-- Atualizar inadimplência para Barra 2025
UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 1;

UPDATE dados_mensais SET inadimplencia = 0.50 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 2;

UPDATE dados_mensais SET inadimplencia = 1.78 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 3;

UPDATE dados_mensais SET inadimplencia = 1.08 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 4;

UPDATE dados_mensais SET inadimplencia = 0.93 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 5;

UPDATE dados_mensais SET inadimplencia = 0.50 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 6;

UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 7;

UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 8;

UPDATE dados_mensais SET inadimplencia = 0.46 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 9;

UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 10;

UPDATE dados_mensais SET inadimplencia = 0.00 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 11;

UPDATE dados_mensais SET inadimplencia = 0.47 
WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 12;
