-- Auditoria de segurança — RLS Grupo B: 9 tabelas que o front acessa direto.
-- ENABLE RLS + policy que fecha anon mas preserva os roles legítimos:
--   authenticated (front), mila_acesso_restrito / sol_acesso_restrito (agentes com
--   SELECT, SEM bypassrls). service_role/postgres/fabio_agent/lia_acesso_restrito já
--   bypassam RLS. anon fica de fora -> bloqueado.
-- Policy USING(true) restrita a roles = passo A1 (fechar anon). Refino por
-- unidade/admin (is_admin_usuario()/get_unidade_usuario()) fica como camada 2.
DO $$
DECLARE t text;
DECLARE tabelas text[] := ARRAY[
  'competencias_mensais','crm_templates_whatsapp','emusys_sync_log','inventario_pendencias',
  'lead_experimentais','leads_automacao_log','projeto_config_permissoes','projeto_equipe_membros','whatsapp_config'];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated, mila_acesso_restrito, sol_acesso_restrito USING (true) WITH CHECK (true)',
      'rls_'||t||'_roles_internos', t);
  END LOOP;
END $$;
