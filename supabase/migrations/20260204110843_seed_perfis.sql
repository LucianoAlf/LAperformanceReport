-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- =====================================================
-- FASE 2.1: Seed de Perfis Padrão
-- =====================================================

INSERT INTO perfis (nome, descricao, nivel, icone, cor, sistema) VALUES
  ('Admin', 'Acesso total ao sistema', 100, '🛡️', '#ef4444', true),
  ('Gerente', 'Gerente de unidade', 50, '💼', '#f59e0b', true),
  ('Farmer', 'Atendimento e retenção de alunos', 30, '👥', '#10b981', true),
  ('Hunter', 'Captação e vendas', 30, '🎯', '#3b82f6', true),
  ('Professor', 'Acesso aos alunos e aulas', 20, '🎵', '#8b5cf6', true),
  ('Visualizador', 'Apenas visualização de dados', 10, '👁️', '#64748b', true)
ON CONFLICT (nome) DO NOTHING;
