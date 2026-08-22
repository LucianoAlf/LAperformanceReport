-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- 12. RLS POLICIES
-- =====================================================

-- config_health_score_aluno
ALTER TABLE config_health_score_aluno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read config" ON config_health_score_aluno;
DROP POLICY IF EXISTS "Authenticated users can manage config" ON config_health_score_aluno;
CREATE POLICY "Authenticated users can read config" ON config_health_score_aluno
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage config" ON config_health_score_aluno
  FOR ALL USING (auth.role() = 'authenticated');

-- aluno_feedback_sessoes
ALTER TABLE aluno_feedback_sessoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage feedback sessions" ON aluno_feedback_sessoes;
DROP POLICY IF EXISTS "Public can read sessions by token" ON aluno_feedback_sessoes;
CREATE POLICY "Authenticated users can manage feedback sessions" ON aluno_feedback_sessoes
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Public can read sessions by token" ON aluno_feedback_sessoes
  FOR SELECT USING (true);

-- aluno_feedback_professor
ALTER TABLE aluno_feedback_professor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read all feedback" ON aluno_feedback_professor;
DROP POLICY IF EXISTS "Authenticated users can manage feedback" ON aluno_feedback_professor;
DROP POLICY IF EXISTS "Public can insert feedback via session" ON aluno_feedback_professor;
CREATE POLICY "Authenticated users can read all feedback" ON aluno_feedback_professor
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage feedback" ON aluno_feedback_professor
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Public can insert feedback via session" ON aluno_feedback_professor
  FOR INSERT WITH CHECK (true);

-- aluno_acoes
ALTER TABLE aluno_acoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage actions" ON aluno_acoes;
CREATE POLICY "Authenticated users can manage actions" ON aluno_acoes
  FOR ALL USING (auth.role() = 'authenticated');

-- aluno_metas
ALTER TABLE aluno_metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage goals" ON aluno_metas;
CREATE POLICY "Authenticated users can manage goals" ON aluno_metas
  FOR ALL USING (auth.role() = 'authenticated');

-- aluno_presenca
ALTER TABLE aluno_presenca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can manage attendance" ON aluno_presenca;
DROP POLICY IF EXISTS "Public can update attendance via token" ON aluno_presenca;
CREATE POLICY "Authenticated users can manage attendance" ON aluno_presenca
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Public can update attendance via token" ON aluno_presenca
  FOR UPDATE USING (token IS NOT NULL AND status = 'pendente');

-- =====================================================
-- 13. GRANTS
-- =====================================================
GRANT SELECT ON vw_aluno_sucesso_lista TO authenticated;
GRANT SELECT ON vw_aluno_sucesso_resumo TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_health_score_aluno TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_health_score_alunos_batch TO authenticated;
