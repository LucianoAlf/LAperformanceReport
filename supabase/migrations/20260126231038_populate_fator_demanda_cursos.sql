-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Popular fator_demanda baseado na distribuição real de alunos
-- Dados da auditoria:
-- Bateria: 25.97% -> 1.0 (curso grande)
-- Canto: 20.66% -> 1.0 (curso grande)
-- Teclado: 17.90% -> 1.0 (curso grande)
-- Musicalização Preparatória: 10.94% -> 1.5 (médio-grande)
-- Guitarra: 9.39% -> 2.0 (médio)
-- Violão: 5.08% -> 2.0 (médio)
-- Piano: 2.87% -> 2.5 (pequeno)
-- Violino: 1.99% -> 3.0 (muito pequeno)
-- Contrabaixo: 1.88% -> 3.0 (muito pequeno)
-- Musicalização para Bebês: 1.77% -> 3.0 (muito pequeno)
-- Ukulele: 0.55% -> 3.0 (muito pequeno)
-- Cavaquinho: 0.33% -> 3.0 (muito pequeno)
-- Produção Musical: 0.33% -> 3.0 (muito pequeno)
-- Flauta Transversal: 0.22% -> 3.0 (muito pequeno)
-- Saxofone: 0.11% -> 3.0 (muito pequeno)
-- Banda: 0% -> 3.0 (muito pequeno)
-- Teoria Musical: 0% -> 3.0 (muito pequeno)

-- Cursos grandes (≥15%)
UPDATE cursos SET fator_demanda = 1.0 WHERE nome IN ('Bateria', 'Canto', 'Teclado');

-- Cursos médio-grandes (10-14.99%)
UPDATE cursos SET fator_demanda = 1.5 WHERE nome IN ('Musicalização Preparatória');

-- Cursos médios (5-9.99%)
UPDATE cursos SET fator_demanda = 2.0 WHERE nome IN ('Guitarra', 'Violão');

-- Cursos pequenos (2-4.99%)
UPDATE cursos SET fator_demanda = 2.5 WHERE nome IN ('Piano');

-- Cursos muito pequenos (<2%)
UPDATE cursos SET fator_demanda = 3.0 WHERE nome IN (
    'Violino', 'Contrabaixo', 'Musicalização para Bebês', 'Ukulele', 
    'Cavaquinho', 'Produção Musical', 'Flauta Transversal', 'Saxofone',
    'Banda', 'Teoria Musical'
);
