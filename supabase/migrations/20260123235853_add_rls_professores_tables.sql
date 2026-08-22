-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Habilitar RLS nas tabelas de professores
ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
ALTER TABLE professores_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE professores_cursos ENABLE ROW LEVEL SECURITY;

-- Políticas para tabela professores (CRUD completo para usuários autenticados)
CREATE POLICY "professores_select_all" ON professores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "professores_insert_all" ON professores
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "professores_update_all" ON professores
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "professores_delete_all" ON professores
  FOR DELETE TO authenticated USING (true);

-- Políticas para tabela professores_unidades (CRUD completo)
CREATE POLICY "professores_unidades_select_all" ON professores_unidades
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "professores_unidades_insert_all" ON professores_unidades
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "professores_unidades_update_all" ON professores_unidades
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "professores_unidades_delete_all" ON professores_unidades
  FOR DELETE TO authenticated USING (true);

-- Políticas para tabela professores_cursos (CRUD completo)
CREATE POLICY "professores_cursos_select_all" ON professores_cursos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "professores_cursos_insert_all" ON professores_cursos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "professores_cursos_update_all" ON professores_cursos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "professores_cursos_delete_all" ON professores_cursos
  FOR DELETE TO authenticated USING (true);
