-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

ALTER TABLE professor_360_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_ocorrencias_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_avaliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE professor_360_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura criterios" ON professor_360_criterios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura ocorrencias" ON professor_360_ocorrencias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura ocorrencias_log" ON professor_360_ocorrencias_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura avaliacoes" ON professor_360_avaliacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leitura config" ON professor_360_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Escrita criterios" ON professor_360_criterios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita ocorrencias" ON professor_360_ocorrencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita avaliacoes" ON professor_360_avaliacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Escrita config" ON professor_360_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
