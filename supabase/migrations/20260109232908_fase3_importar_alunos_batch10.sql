-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Batch 10 (registros 930-943 - últimos registros Barra)
INSERT INTO alunos (nome, data_nascimento, data_matricula, curso_id, professor_atual_id, valor_parcela, tipo_matricula_id, status, unidade_id, dia_aula, horario_aula, percentual_presenca) VALUES
('Thoth dos Anjos de Oliveira', '2023-06-21', '2024-02-05', 7, 6, 426, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Quinta', '16:00:00', 89),
('Tito Lapa Cazarim', '2017-06-11', '2025-09-20', 12, 10, 365, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Sexta', '17:00:00', 92),
('Valentina Natividade de Sá Macedo', '2016-02-15', '2024-03-04', 2, 10, 350, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Sábado', '11:00:00', 69),
('Vicente Graça Vianna', '2016-12-19', '2025-08-23', 2, 20, 460, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Sexta', '19:00:00', 50),
('Victor de Azevedo Pacheco', '2014-07-07', '2024-02-28', 1, 6, 395, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Quarta', '17:00:00', 73),
('Vinicius Cunha Oliveira', '1987-08-17', '2024-12-03', 1, 6, 365, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Sexta', '16:00:00', 65),
('Vitor Hugo Carvalho de Castro', '2017-02-16', '2023-03-18', 1, 31, 492, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Sábado', '11:00:00', 75),
('Vitoria da Luz', '2000-11-21', '2023-12-04', 2, 3, 437, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Quarta', '19:00:00', 61),
('Vivian Dangelo', '1985-01-30', '2025-07-31', 12, 24, 365, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Sábado', '13:00:00', 59),
('Wanessa Monte Caporali', '1985-03-11', '2025-09-17', 9, 19, 350, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Quinta', '19:00:00', 44),
('William Gaspar da Silva Oliveira', '1993-09-02', '2025-12-08', 1, 41, 437, 1, 'ativo', '368d47f5-2d88-4475-bc14-ba084a9a348e', 'Segunda', '18:00:00', 100);
