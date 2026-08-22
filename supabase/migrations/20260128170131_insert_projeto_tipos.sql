-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Dados iniciais: Tipos de Projeto
INSERT INTO projeto_tipos (nome, descricao, icone, cor) VALUES
  ('Semana Temática', 'Eventos temáticos semanais como Semana do Baterista, Semana do Violão, etc.', '🎉', 'violet'),
  ('Recital', 'Apresentações de alunos em formato recital', '🎵', 'cyan'),
  ('Show de Banda', 'Apresentações de bandas formadas por alunos', '🎸', 'rose'),
  ('Material Didático', 'Criação de apostilas, vídeo-aulas e materiais de apoio', '📚', 'emerald'),
  ('Produção de Conteúdo', 'Conteúdo para redes sociais, marketing e comunicação', '📱', 'amber'),
  ('Vídeo Aulas', 'Gravação e edição de vídeo-aulas para cursos online', '🎬', 'blue')
ON CONFLICT DO NOTHING;
