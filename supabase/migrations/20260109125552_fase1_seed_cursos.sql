-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- SEED: CURSOS (16 registros)
INSERT INTO cursos (nome) VALUES
('Bateria'),
('Canto'),
('Cavaquinho'),
('Contrabaixo'),
('Flauta Transversal'),
('Guitarra'),
('Musicalização para Bebês'),
('Musicalização Preparatória'),
('Piano'),
('Produção Musical'),
('Saxofone'),
('Teclado'),
('Teoria Musical'),
('Ukulele'),
('Violão'),
('Violino')
ON CONFLICT (nome_normalizado) DO NOTHING;
