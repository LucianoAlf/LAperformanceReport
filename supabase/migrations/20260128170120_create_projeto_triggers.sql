-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_projeto_tipos_updated_at ON projeto_tipos;
CREATE TRIGGER update_projeto_tipos_updated_at
  BEFORE UPDATE ON projeto_tipos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projetos_updated_at ON projetos;
CREATE TRIGGER update_projetos_updated_at
  BEFORE UPDATE ON projetos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projeto_fases_updated_at ON projeto_fases;
CREATE TRIGGER update_projeto_fases_updated_at
  BEFORE UPDATE ON projeto_fases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projeto_tarefas_updated_at ON projeto_tarefas;
CREATE TRIGGER update_projeto_tarefas_updated_at
  BEFORE UPDATE ON projeto_tarefas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
