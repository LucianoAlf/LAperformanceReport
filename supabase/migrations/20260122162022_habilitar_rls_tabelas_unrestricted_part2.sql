-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =============================================
-- HABILITAR RLS E CRIAR POLICIES PARA TABELAS UNRESTRICTED (PARTE 2)
-- =============================================

-- 8. motivos_nao_matricula
ALTER TABLE motivos_nao_matricula ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS motivos_nao_matricula_select ON motivos_nao_matricula;
CREATE POLICY motivos_nao_matricula_select ON motivos_nao_matricula FOR SELECT USING (true);
DROP POLICY IF EXISTS motivos_nao_matricula_insert ON motivos_nao_matricula;
CREATE POLICY motivos_nao_matricula_insert ON motivos_nao_matricula FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS motivos_nao_matricula_update ON motivos_nao_matricula;
CREATE POLICY motivos_nao_matricula_update ON motivos_nao_matricula FOR UPDATE USING (true);
DROP POLICY IF EXISTS motivos_nao_matricula_delete ON motivos_nao_matricula;
CREATE POLICY motivos_nao_matricula_delete ON motivos_nao_matricula FOR DELETE USING (true);

-- 9. motivos_saida
ALTER TABLE motivos_saida ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS motivos_saida_select ON motivos_saida;
CREATE POLICY motivos_saida_select ON motivos_saida FOR SELECT USING (true);
DROP POLICY IF EXISTS motivos_saida_insert ON motivos_saida;
CREATE POLICY motivos_saida_insert ON motivos_saida FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS motivos_saida_update ON motivos_saida;
CREATE POLICY motivos_saida_update ON motivos_saida FOR UPDATE USING (true);
DROP POLICY IF EXISTS motivos_saida_delete ON motivos_saida;
CREATE POLICY motivos_saida_delete ON motivos_saida FOR DELETE USING (true);

-- 10. origem_leads
ALTER TABLE origem_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS origem_leads_select ON origem_leads;
CREATE POLICY origem_leads_select ON origem_leads FOR SELECT USING (true);
DROP POLICY IF EXISTS origem_leads_insert ON origem_leads;
CREATE POLICY origem_leads_insert ON origem_leads FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS origem_leads_update ON origem_leads;
CREATE POLICY origem_leads_update ON origem_leads FOR UPDATE USING (true);
DROP POLICY IF EXISTS origem_leads_delete ON origem_leads;
CREATE POLICY origem_leads_delete ON origem_leads FOR DELETE USING (true);

-- 11. professores_experimentais
ALTER TABLE professores_experimentais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS professores_experimentais_select ON professores_experimentais;
CREATE POLICY professores_experimentais_select ON professores_experimentais FOR SELECT USING (true);
DROP POLICY IF EXISTS professores_experimentais_insert ON professores_experimentais;
CREATE POLICY professores_experimentais_insert ON professores_experimentais FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS professores_experimentais_update ON professores_experimentais;
CREATE POLICY professores_experimentais_update ON professores_experimentais FOR UPDATE USING (true);
DROP POLICY IF EXISTS professores_experimentais_delete ON professores_experimentais;
CREATE POLICY professores_experimentais_delete ON professores_experimentais FOR DELETE USING (true);

-- 12. professores_performance
ALTER TABLE professores_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS professores_performance_select ON professores_performance;
CREATE POLICY professores_performance_select ON professores_performance FOR SELECT USING (true);
DROP POLICY IF EXISTS professores_performance_insert ON professores_performance;
CREATE POLICY professores_performance_insert ON professores_performance FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS professores_performance_update ON professores_performance;
CREATE POLICY professores_performance_update ON professores_performance FOR UPDATE USING (true);
DROP POLICY IF EXISTS professores_performance_delete ON professores_performance;
CREATE POLICY professores_performance_delete ON professores_performance FOR DELETE USING (true);

-- 13. tipos_matricula
ALTER TABLE tipos_matricula ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tipos_matricula_select ON tipos_matricula;
CREATE POLICY tipos_matricula_select ON tipos_matricula FOR SELECT USING (true);
DROP POLICY IF EXISTS tipos_matricula_insert ON tipos_matricula;
CREATE POLICY tipos_matricula_insert ON tipos_matricula FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS tipos_matricula_update ON tipos_matricula;
CREATE POLICY tipos_matricula_update ON tipos_matricula FOR UPDATE USING (true);
DROP POLICY IF EXISTS tipos_matricula_delete ON tipos_matricula;
CREATE POLICY tipos_matricula_delete ON tipos_matricula FOR DELETE USING (true);

-- 14. tipos_saida
ALTER TABLE tipos_saida ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tipos_saida_select ON tipos_saida;
CREATE POLICY tipos_saida_select ON tipos_saida FOR SELECT USING (true);
DROP POLICY IF EXISTS tipos_saida_insert ON tipos_saida;
CREATE POLICY tipos_saida_insert ON tipos_saida FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS tipos_saida_update ON tipos_saida;
CREATE POLICY tipos_saida_update ON tipos_saida FOR UPDATE USING (true);
DROP POLICY IF EXISTS tipos_saida_delete ON tipos_saida;
CREATE POLICY tipos_saida_delete ON tipos_saida FOR DELETE USING (true);
