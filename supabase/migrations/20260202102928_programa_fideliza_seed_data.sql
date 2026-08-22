-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 5. Inserir configuração padrão para 2026
INSERT INTO programa_fideliza_config (ano)
VALUES (2026)
ON CONFLICT (ano) DO NOTHING;

-- 6. Inserir experiências padrão
INSERT INTO programa_fideliza_experiencias (tipo, nome, descricao, emoji, valor_estimado) VALUES
('standard', 'Cinema + Pipoca', 'Ingresso + combo para 2 pessoas', '🍿', 100),
('standard', 'Jantar Casual', 'Vale R$150 em restaurante parceiro', '🍕', 150),
('standard', 'Experiência Gamer', '2h em arena de games', '🎮', 120),
('premium', 'Jantar Gastronômico', 'Experiência em restaurante premium para 2', '🍽️', 400),
('premium', 'Teatro/Show', 'Ingressos para espetáculo + jantar', '🎭', 500),
('premium', 'Day Use Resort', 'Dia em resort com acompanhante', '🏖️', 600)
ON CONFLICT DO NOTHING;
