-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Atualizar ticket_medio com valores reais (com desconto) do CSV
-- Campo Grande
UPDATE dados_mensais SET ticket_medio = 373.79 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 1;
UPDATE dados_mensais SET ticket_medio = 368.10 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 2;
UPDATE dados_mensais SET ticket_medio = 363.75 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 3;
UPDATE dados_mensais SET ticket_medio = 361.27 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 4;
UPDATE dados_mensais SET ticket_medio = 356.81 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 5;
UPDATE dados_mensais SET ticket_medio = 391.08 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 6;
UPDATE dados_mensais SET ticket_medio = 370.92 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 7;
UPDATE dados_mensais SET ticket_medio = 372.17 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 8;
UPDATE dados_mensais SET ticket_medio = 397.83 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 9;
UPDATE dados_mensais SET ticket_medio = 362.64 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 10;
UPDATE dados_mensais SET ticket_medio = 369.75 WHERE unidade_id = '2ec861f6-023f-4d7b-9927-3960ad8c2a92' AND ano = 2025 AND mes = 11;
-- Dez/25 Campo Grande não tem valor no CSV

-- Recreio
UPDATE dados_mensais SET ticket_medio = 426.24 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 1;
UPDATE dados_mensais SET ticket_medio = 490.43 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 2;
UPDATE dados_mensais SET ticket_medio = 440.46 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 3;
UPDATE dados_mensais SET ticket_medio = 405.31 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 4;
UPDATE dados_mensais SET ticket_medio = 460.50 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 5;
UPDATE dados_mensais SET ticket_medio = 396.46 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 6;
UPDATE dados_mensais SET ticket_medio = 406.67 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 7;
UPDATE dados_mensais SET ticket_medio = 398.25 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 8;
UPDATE dados_mensais SET ticket_medio = 389.67 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 9;
UPDATE dados_mensais SET ticket_medio = 398.33 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 10;
UPDATE dados_mensais SET ticket_medio = 402.31 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 11;
UPDATE dados_mensais SET ticket_medio = 405.00 WHERE unidade_id = '95553e96-971b-4590-a6eb-0201d013c14d' AND ano = 2025 AND mes = 12;

-- Barra
UPDATE dados_mensais SET ticket_medio = 442.36 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 1;
UPDATE dados_mensais SET ticket_medio = 460.12 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 2;
UPDATE dados_mensais SET ticket_medio = 464.76 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 3;
UPDATE dados_mensais SET ticket_medio = 447.00 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 4;
UPDATE dados_mensais SET ticket_medio = 465.25 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 5;
UPDATE dados_mensais SET ticket_medio = 433.81 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 6;
UPDATE dados_mensais SET ticket_medio = 453.04 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 7;
UPDATE dados_mensais SET ticket_medio = 455.21 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 8;
UPDATE dados_mensais SET ticket_medio = 445.12 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 9;
UPDATE dados_mensais SET ticket_medio = 464.69 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 10;
UPDATE dados_mensais SET ticket_medio = 460.80 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 11;
UPDATE dados_mensais SET ticket_medio = 457.00 WHERE unidade_id = '368d47f5-2d88-4475-bc14-ba084a9a348e' AND ano = 2025 AND mes = 12;
