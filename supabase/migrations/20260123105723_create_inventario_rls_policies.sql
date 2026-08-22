-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Habilitar RLS nas tabelas
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_manutencoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimentacoes ENABLE ROW LEVEL SECURITY;

-- Políticas para inventario
CREATE POLICY "inventario_select_policy" ON inventario
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "inventario_insert_policy" ON inventario
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "inventario_update_policy" ON inventario
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "inventario_delete_policy" ON inventario
  FOR DELETE TO authenticated
  USING (true);

-- Políticas para inventario_manutencoes
CREATE POLICY "manutencoes_select_policy" ON inventario_manutencoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "manutencoes_insert_policy" ON inventario_manutencoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "manutencoes_update_policy" ON inventario_manutencoes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "manutencoes_delete_policy" ON inventario_manutencoes
  FOR DELETE TO authenticated
  USING (true);

-- Políticas para inventario_movimentacoes
CREATE POLICY "movimentacoes_select_policy" ON inventario_movimentacoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "movimentacoes_insert_policy" ON inventario_movimentacoes
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "movimentacoes_update_policy" ON inventario_movimentacoes
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "movimentacoes_delete_policy" ON inventario_movimentacoes
  FOR DELETE TO authenticated
  USING (true);
