-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- PILOTO da auditoria de seguranca: fecha crm_mensagens pra anon.
-- Troca TO public -> TO authenticated, mantendo a condicao (true) identica.
-- Usuario logado: comportamento identico. Anon (sem login): bloqueado.

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
