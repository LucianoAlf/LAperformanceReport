-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Habilitar RLS nas tabelas CRM auxiliares
ALTER TABLE crm_pipeline_etapas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_metas_andreza ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_motivos_nao_comparecimento ENABLE ROW LEVEL SECURITY;

-- crm_pipeline_etapas: todos autenticados podem ler, admin pode modificar
CREATE POLICY "crm_pipeline_etapas_select" ON crm_pipeline_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_pipeline_etapas_insert" ON crm_pipeline_etapas FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "crm_pipeline_etapas_update" ON crm_pipeline_etapas FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "crm_pipeline_etapas_delete" ON crm_pipeline_etapas FOR DELETE TO authenticated USING (is_admin());

-- crm_lead_historico: mesma lógica da leads (admin ou unidade do usuário)
CREATE POLICY "crm_lead_historico_select" ON crm_lead_historico FOR SELECT TO authenticated 
  USING (is_admin() OR EXISTS (SELECT 1 FROM leads WHERE leads.id = crm_lead_historico.lead_id AND leads.unidade_id = get_user_unidade_id()));
CREATE POLICY "crm_lead_historico_insert" ON crm_lead_historico FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crm_lead_historico_update" ON crm_lead_historico FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "crm_lead_historico_delete" ON crm_lead_historico FOR DELETE TO authenticated USING (is_admin());

-- crm_followups: mesma lógica da leads
CREATE POLICY "crm_followups_select" ON crm_followups FOR SELECT TO authenticated 
  USING (is_admin() OR EXISTS (SELECT 1 FROM leads WHERE leads.id = crm_followups.lead_id AND leads.unidade_id = get_user_unidade_id()));
CREATE POLICY "crm_followups_insert" ON crm_followups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crm_followups_update" ON crm_followups FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "crm_followups_delete" ON crm_followups FOR DELETE TO authenticated USING (is_admin());

-- crm_metas_andreza: todos autenticados podem ler, admin pode modificar
CREATE POLICY "crm_metas_andreza_select" ON crm_metas_andreza FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_metas_andreza_insert" ON crm_metas_andreza FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "crm_metas_andreza_update" ON crm_metas_andreza FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "crm_metas_andreza_delete" ON crm_metas_andreza FOR DELETE TO authenticated USING (is_admin());

-- crm_motivos_nao_comparecimento: todos autenticados podem ler, admin pode modificar
CREATE POLICY "crm_motivos_select" ON crm_motivos_nao_comparecimento FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_motivos_insert" ON crm_motivos_nao_comparecimento FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "crm_motivos_update" ON crm_motivos_nao_comparecimento FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "crm_motivos_delete" ON crm_motivos_nao_comparecimento FOR DELETE TO authenticated USING (is_admin());
