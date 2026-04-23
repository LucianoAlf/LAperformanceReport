-- =====================================================
-- MIGRAÇÃO DADOS COMERCIAIS 2025 - FASE 1
-- Dados Agregados Mensais → dados_comerciais
-- =====================================================

-- Limpar dados existentes de 2025
DELETE FROM dados_comerciais WHERE EXTRACT(YEAR FROM competencia) = 2025;

-- CAMPO GRANDE 2025
INSERT INTO dados_comerciais (competencia, unidade, total_leads, aulas_experimentais, novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla, ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte) VALUES
('2025-01-01', 'Campo Grande', 245, 19, 42, 17, 25, 373.79, 386.21, 15586.00),
('2025-02-01', 'Campo Grande', 436, 33, 29, 7, 22, 368.10, 405.74, 11404.00),
('2025-03-01', 'Campo Grande', 374, 25, 20, 6, 14, 363.75, 398.40, 7968.00),
('2025-04-01', 'Campo Grande', 396, 22, 21, 9, 12, 361.27, 396.31, 8328.00),
('2025-05-01', 'Campo Grande', 286, 41, 37, 21, 16, 356.81, 422.11, 15618.00),
('2025-06-01', 'Campo Grande', 256, 36, 12, 3, 9, 391.08, 433.00, 5196.00),
('2025-07-01', 'Campo Grande', 248, 15, 17, 7, 10, 370.92, 431.95, 7300.00),
('2025-08-01', 'Campo Grande', 346, 44, 29, 11, 18, 372.17, 384.83, 11160.00),
('2025-09-01', 'Campo Grande', 367, 40, 23, 8, 15, 397.83, 437.26, 10057.00),
('2025-10-01', 'Campo Grande', 434, 30, 11, 8, 3, 362.64, 330.00, 3630.00),
('2025-11-01', 'Campo Grande', 470, 39, 24, 7, 17, 369.75, 286.46, 6875.00),
('2025-12-01', 'Campo Grande', 262, 3, 0, 0, 0, NULL, NULL, NULL);

-- RECREIO 2025
INSERT INTO dados_comerciais (competencia, unidade, total_leads, aulas_experimentais, novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla, ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte) VALUES
('2025-01-01', 'Recreio', 112, 42, 30, 21, 9, 426.24, 505.37, 12230.00),
('2025-02-01', 'Recreio', 225, 24, 17, 3, 14, 490.43, 454.32, 7360.00),
('2025-03-01', 'Recreio', 133, 38, 18, 10, 8, 440.46, 450.87, 7800.00),
('2025-04-01', 'Recreio', 93, 29, 16, 11, 5, 405.31, 424.38, 6790.00),
('2025-05-01', 'Recreio', 140, 28, 10, 3, 7, 460.50, 421.00, 4210.00),
('2025-06-01', 'Recreio', 108, 23, 10, 4, 6, 396.46, 424.24, 4200.00),
('2025-07-01', 'Recreio', 99, 25, 9, 4, 5, 406.67, 444.44, 4000.00),
('2025-08-01', 'Recreio', 250, 44, 40, 25, 15, 398.25, 260.00, 10400.00),
('2025-09-01', 'Recreio', 127, 28, 15, 6, 9, 389.67, 304.67, 4570.00),
('2025-10-01', 'Recreio', 82, 13, 6, 3, 3, 398.33, 290.00, 1740.00),
('2025-11-01', 'Recreio', 93, 18, 13, 5, 8, 402.31, 168.46, 2190.00),
('2025-12-01', 'Recreio', 79, 12, 4, 4, 0, 405.00, 262.50, 1050.00);

-- BARRA 2025
INSERT INTO dados_comerciais (competencia, unidade, total_leads, aulas_experimentais, novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla, ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte) VALUES
('2025-01-01', 'Barra', 129, 19, 16, 11, 5, 442.36, 468.26, 7141.00),
('2025-02-01', 'Barra', 144, 16, 18, 9, 9, 460.12, 490.87, 8443.00),
('2025-03-01', 'Barra', 141, 28, 13, 9, 4, 464.76, 495.24, 6240.00),
('2025-04-01', 'Barra', 112, 17, 6, 2, 4, 447.00, 440.67, 2644.00),
('2025-05-01', 'Barra', 115, 30, 12, 9, 3, 465.25, 511.69, 6038.00),
('2025-06-01', 'Barra', 179, 20, 12, 4, 8, 433.81, 494.16, 5584.00),
('2025-07-01', 'Barra', 177, 25, 12, 5, 7, 453.04, 504.09, 5797.00),
('2025-08-01', 'Barra', 160, 26, 16, 9, 7, 455.21, 471.92, 6889.99),
('2025-09-01', 'Barra', 141, 15, 13, 11, 2, 445.12, 477.69, 5780.00),
('2025-10-01', 'Barra', 106, 14, 10, 4, 6, 464.69, 486.63, 4769.00),
('2025-11-01', 'Barra', 130, 12, 9, 7, 2, 460.80, 238.51, 2075.00),
('2025-12-01', 'Barra', 78, 8, 3, 2, 1, 457.00, 439.67, 1319.00);

-- Verificar dados inseridos
SELECT unidade, COUNT(*) as meses, SUM(total_leads) as total_leads, SUM(novas_matriculas_total) as total_matriculas
FROM dados_comerciais 
WHERE EXTRACT(YEAR FROM competencia) = 2025
GROUP BY unidade;
