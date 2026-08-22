-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- CORRIGIR ticket_medio com valores de PARCELAS (coluna ticket_medio_parcelas do CSV)
-- Campo Grande
UPDATE dados_mensais SET ticket_medio = 351.38 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 1;
UPDATE dados_mensais SET ticket_medio = 352.31 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 2;
UPDATE dados_mensais SET ticket_medio = 353.60 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 3;
UPDATE dados_mensais SET ticket_medio = 357.64 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 4;
UPDATE dados_mensais SET ticket_medio = 365.08 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 5;
UPDATE dados_mensais SET ticket_medio = 363.23 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 6;
UPDATE dados_mensais SET ticket_medio = 363.45 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 7;
UPDATE dados_mensais SET ticket_medio = 367.55 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 8;
UPDATE dados_mensais SET ticket_medio = 375.87 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 9;
UPDATE dados_mensais SET ticket_medio = 372.09 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 10;
UPDATE dados_mensais SET ticket_medio = 371.52 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 11;
-- Dez/25 Campo Grande não tem valor no CSV

-- Recreio
UPDATE dados_mensais SET ticket_medio = 383.13 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 1;
UPDATE dados_mensais SET ticket_medio = 418.15 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 2;
UPDATE dados_mensais SET ticket_medio = 410.52 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 3;
UPDATE dados_mensais SET ticket_medio = 428.66 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 4;
UPDATE dados_mensais SET ticket_medio = 414.49 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 5;
UPDATE dados_mensais SET ticket_medio = 416.98 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 6;
UPDATE dados_mensais SET ticket_medio = 425.29 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 7;
UPDATE dados_mensais SET ticket_medio = 420.22 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 8;
UPDATE dados_mensais SET ticket_medio = 432.04 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 9;
UPDATE dados_mensais SET ticket_medio = 427.91 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 10;
UPDATE dados_mensais SET ticket_medio = 428.50 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 11;
UPDATE dados_mensais SET ticket_medio = 429.57 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 12;

-- Barra
UPDATE dados_mensais SET ticket_medio = 404.55 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 1;
UPDATE dados_mensais SET ticket_medio = 411.38 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 2;
UPDATE dados_mensais SET ticket_medio = 411.87 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 3;
UPDATE dados_mensais SET ticket_medio = 419.29 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 4;
UPDATE dados_mensais SET ticket_medio = 426.92 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 5;
UPDATE dados_mensais SET ticket_medio = 430.17 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 6;
UPDATE dados_mensais SET ticket_medio = 436.79 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 7;
UPDATE dados_mensais SET ticket_medio = 430.39 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 8;
UPDATE dados_mensais SET ticket_medio = 435.85 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 9;
UPDATE dados_mensais SET ticket_medio = 435.17 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 10;
UPDATE dados_mensais SET ticket_medio = 431.16 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 11;
UPDATE dados_mensais SET ticket_medio = 440.24 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 12;
