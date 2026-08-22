-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Tabelas de referência: acesso público para leitura
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "unidades_select_policy" ON unidades;
CREATE POLICY "unidades_select_policy" ON unidades FOR SELECT USING (true);

ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cursos_select_policy" ON cursos;
CREATE POLICY "cursos_select_policy" ON cursos FOR SELECT USING (true);

ALTER TABLE professores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "professores_select_policy" ON professores;
CREATE POLICY "professores_select_policy" ON professores FOR SELECT USING (true);

ALTER TABLE canais_origem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "canais_origem_select_policy" ON canais_origem;
CREATE POLICY "canais_origem_select_policy" ON canais_origem FOR SELECT USING (true);
