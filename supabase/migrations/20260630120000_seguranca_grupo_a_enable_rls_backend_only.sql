-- Auditoria de segurança 2026-06-30 — Grupo A: tabelas backend-only sem RLS.
-- Ver docs/auditoria-seguranca-2026-06-30.md
--
-- Estratégia: ENABLE RLS sem policy. O role `service_role` (edges/crons) tem
-- BYPASSRLS, então continua acessando normalmente; anon/authenticated ficam
-- trancados. Nenhuma destas tabelas é lida/escrita via `from()` no frontend
-- (acesso só por edge/cron; matriculas_divergencias* via RPC SECURITY DEFINER:
-- get_conciliacao_matriculas / aplicar_conciliacao_decisao).
--
-- ENABLE ROW LEVEL SECURITY é idempotente (não falha se já habilitado).

ALTER TABLE public.alunos_arquivados                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boas_vindas_enviadas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competencias_bloqueios_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_emusys_depara                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dados_mensais_retificacoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fila_relatorios_whatsapp           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_experimentais_decisoes_humanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_reservas                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas_campos_fixados          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas_divergencias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas_divergencias_decisoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professores_emusys_divergencias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professores_sync_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_mila                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_debug_log                  ENABLE ROW LEVEL SECURITY;
