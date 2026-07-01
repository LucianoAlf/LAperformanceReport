-- Auditoria de segurança C1 — Sprint 1: trigger functions
-- Revoga EXECUTE de PUBLIC/anon/authenticated das 9 funções SECURITY DEFINER
-- que retornam `trigger`. São executadas internamente pelos triggers anexados
-- (independente do privilégio EXECUTE do role que dispara o DML) e o PostgREST
-- não expõe funções `trigger` por RPC. Impacto funcional: zero.
-- postgres (owner) e service_role permanecem com EXECUTE.

REVOKE EXECUTE ON FUNCTION public.set_updated_at_caixa()                       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_audit_log()                              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_bi_conversation_autofill()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_log_ocorrencia_criada()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preencher_campos_retencao_movimentacoes_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_sync_student_studio()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_evasao_to_dados_mensais()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_leads_to_dados_comerciais()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_leads_to_origem_leads()                FROM PUBLIC, anon, authenticated;
