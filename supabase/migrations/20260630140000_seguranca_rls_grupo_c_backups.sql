-- Auditoria de segurança — RLS Grupo C: tabelas de backup/lixo
-- ENABLE RLS sem policy = nega anon/authenticated (que hoje leem PII livremente),
-- mantém service_role (BYPASSRLS). Nenhuma referência no código (grep limpo).
-- Passo conservador; DROP definitivo depois, com aprovação.
ALTER TABLE public.evasoes_backup_20260215     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evasoes_legacy_backup        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evasoes_v2_backup            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_backup_flags_20260601  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads_diarios_backup         ENABLE ROW LEVEL SECURITY;
