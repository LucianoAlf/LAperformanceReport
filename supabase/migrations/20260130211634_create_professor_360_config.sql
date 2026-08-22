-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE TABLE IF NOT EXISTS professor_360_config (
  id SERIAL PRIMARY KEY,
  chave VARCHAR(50) UNIQUE NOT NULL,
  valor TEXT NOT NULL,
  descricao TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO professor_360_config (chave, valor, descricao) VALUES
('peso_health_score', '20', 'Peso do 360° no Health Score final (%)'),
('bonus_max_projetos', '10', 'Máximo de pontos extras por projetos'),
('pontos_por_projeto', '5', 'Pontos ganhos por cada projeto realizado')
ON CONFLICT (chave) DO NOTHING;
