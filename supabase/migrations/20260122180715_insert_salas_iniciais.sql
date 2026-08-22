-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Inserir salas iniciais para cada unidade
INSERT INTO salas (unidade_id, nome, codigo, capacidade_maxima, cursos_permitidos, descricao)
SELECT 
  u.id,
  sala.nome,
  sala.codigo,
  sala.capacidade,
  sala.cursos,
  sala.descricao
FROM unidades u
CROSS JOIN (
  VALUES 
    ('Sala 1', 'S1', 4, ARRAY['Guitarra', 'Violão', 'Baixo'], 'Sala de cordas'),
    ('Sala 2', 'S2', 3, ARRAY['Piano', 'Teclado'], 'Sala de teclas'),
    ('Sala 3', 'S3', 2, ARRAY['Bateria'], 'Sala de bateria'),
    ('Sala 4', 'S4', 4, ARRAY['Canto', 'Violino'], 'Sala de canto e cordas acústicas')
) AS sala(nome, codigo, capacidade, cursos, descricao)
ON CONFLICT (unidade_id, nome) DO NOTHING;
