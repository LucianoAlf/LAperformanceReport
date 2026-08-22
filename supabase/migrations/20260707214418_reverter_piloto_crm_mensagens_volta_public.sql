-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- REVERTE o piloto: volta crm_mensagens ao estado original (TO public, true).
-- Feito pra descartar a mudanca como variavel durante o teste.

DROP POLICY IF EXISTS crm_mensagens_select ON public.crm_mensagens;
CREATE POLICY crm_mensagens_select ON public.crm_mensagens
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS crm_mensagens_insert ON public.crm_mensagens;
CREATE POLICY crm_mensagens_insert ON public.crm_mensagens
  FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS crm_mensagens_update ON public.crm_mensagens;
CREATE POLICY crm_mensagens_update ON public.crm_mensagens
  FOR UPDATE TO public USING (true);

DROP POLICY IF EXISTS crm_mensagens_delete ON public.crm_mensagens;
CREATE POLICY crm_mensagens_delete ON public.crm_mensagens
  FOR DELETE TO public USING (true);
