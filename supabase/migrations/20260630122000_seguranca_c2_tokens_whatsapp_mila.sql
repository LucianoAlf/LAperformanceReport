-- Auditoria de segurança 2026-06-30 — C2/C3: tokens de terceiros legíveis e
-- escrita destrutiva liberada em whatsapp_caixas e mila_config.
-- Ver docs/auditoria-seguranca-2026-06-30.md
--
-- Antes: policies role `public` com USING/WITH CHECK `true` → qualquer um (anon
-- incluso) lia uazapi_token/waha_api_key/emusys_token/token_quepasa e podia
-- INSERT/UPDATE/DELETE (apagar caixas, trocar tokens).
--
-- Depois: SELECT só p/ `authenticated` (fecha anon; mantém inbox + telas de
-- config logadas); escrita só p/ admin (is_admin_usuario()).
--
-- Webhooks de mensagem NÃO são afetados: rodam em edge com service_role (BYPASSRLS).
-- Decisão Hugo 2026-06-30: edição de caixas é tarefa de admin.

-- ── whatsapp_caixas ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS whatsapp_caixas_select_all  ON public.whatsapp_caixas;
DROP POLICY IF EXISTS whatsapp_caixas_insert_auth ON public.whatsapp_caixas;
DROP POLICY IF EXISTS whatsapp_caixas_update_auth ON public.whatsapp_caixas;
DROP POLICY IF EXISTS whatsapp_caixas_delete_auth ON public.whatsapp_caixas;

CREATE POLICY whatsapp_caixas_select ON public.whatsapp_caixas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY whatsapp_caixas_insert ON public.whatsapp_caixas
  FOR INSERT TO authenticated WITH CHECK (is_admin_usuario());
CREATE POLICY whatsapp_caixas_update ON public.whatsapp_caixas
  FOR UPDATE TO authenticated USING (is_admin_usuario()) WITH CHECK (is_admin_usuario());
CREATE POLICY whatsapp_caixas_delete ON public.whatsapp_caixas
  FOR DELETE TO authenticated USING (is_admin_usuario());

-- ── mila_config ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS mila_config_select ON public.mila_config;
DROP POLICY IF EXISTS mila_config_insert ON public.mila_config;
DROP POLICY IF EXISTS mila_config_update ON public.mila_config;

CREATE POLICY mila_config_select ON public.mila_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY mila_config_insert ON public.mila_config
  FOR INSERT TO authenticated WITH CHECK (is_admin_usuario());
CREATE POLICY mila_config_update ON public.mila_config
  FOR UPDATE TO authenticated USING (is_admin_usuario()) WITH CHECK (is_admin_usuario());
