-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Fecha crm_mensagens pra anon (troca TO public -> TO authenticated, condicao (true) intacta).
-- Caixa da Lia (admin_mensagens) ja e protegida; nao mexida.

DROP POLICY IF EXISTS crm_mensagens_select ON public.crm_mensagens;
CREATE POLICY crm_mensagens_select ON public.crm_mensagens
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS crm_mensagens_insert ON public.crm_mensagens;
CREATE POLICY crm_mensagens_insert ON public.crm_mensagens
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS crm_mensagens_update ON public.crm_mensagens;
CREATE POLICY crm_mensagens_update ON public.crm_mensagens
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS crm_mensagens_delete ON public.crm_mensagens;
CREATE POLICY crm_mensagens_delete ON public.crm_mensagens
  FOR DELETE TO authenticated USING (true);
