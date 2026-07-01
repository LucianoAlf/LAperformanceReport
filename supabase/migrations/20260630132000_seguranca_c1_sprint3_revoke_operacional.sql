-- Auditoria de segurança C1 — Sprint 3: operacional (25 funções)
-- Camada 1: revoga EXECUTE de PUBLIC/anon. Mantém authenticated (front),
-- service_role (edges/cron), postgres (webhooks n8n via Postgres direto),
-- e os roles de agente que JÁ têm grant explícito (fabio_agent em
-- registrar_aula_fabio; sol_acesso_restrito em sol_registrar_divergencia —
-- ambas sem PUBLIC, então o REVOKE só tira anon delas).
--
-- EXCLUÍDA deste lote: criar_conversa_lead (chamador não identificado no repo;
-- investigar antes de revogar — pode ser uso por agente via PUBLIC).
-- Camada 2 (guarda interna por admin/unidade) tratada em sprint próprio.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'upsert_lead','atualizar_lead_experimental','registrar_experimental',
      'criar_checklist_from_template','marcar_checklist_item','vincular_alunos_checklist','vincular_anamnese_aluno',
      'aplicar_conciliacao_decisao','aplicar_conciliacao_aluno_atributo','ignorar_conciliacao_aluno_atributo',
      'sol_registrar_divergencia','atualizar_health_score','atualizar_percentual_presenca','calcular_health_score_aluno',
      'calcular_health_score_alunos_batch','registrar_log_ocorrencia','editar_ocorrencia','reverter_ocorrencia',
      'restaurar_ocorrencia','registrar_resposta_pesquisa_manual','marcar_conversa_lida','marcar_rotina_concluida',
      'admin_conversa_nova_mensagem','sincronizar_grade_horaria_alunos','registrar_aula_fabio'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
  END LOOP;
END $$;
