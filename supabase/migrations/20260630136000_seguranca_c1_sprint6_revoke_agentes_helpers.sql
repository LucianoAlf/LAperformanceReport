-- C1 Sprint 6 (último): agentes IA + helpers/limpezas/toggles (14 funções) — revoga PUBLIC/anon.
-- Mantém authenticated/service_role/postgres; maria_lareport_rpc preservado nas 5 maria_lareport_*.
-- Verificado: nenhuma em policy RLS; nenhuma é trigger; campo_fixado e
-- is_movimentacao_admin_retencao_valida são helpers boolean chamados por outras funções
-- SECURITY DEFINER (chamada interna roda como postgres, não depende do EXECUTE do anon).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'maria_lareport_buscar_alunos','maria_lareport_consultor_matriculas_mes','maria_lareport_evasoes_mes_detalhe',
      'maria_lareport_matriculas_mes_detalhe','maria_lareport_professor_carteira','mila_check_disponibilidade_visita',
      'resetar_teste_mila','limpar_mila_buffer_antigo','toggle_mila_conversa','toggle_relatorio_cron',
      'cleanup_bi_conversations','limpar_professores_emusys_divergencias_obsoletas',
      'is_movimentacao_admin_retencao_valida','campo_fixado'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
  END LOOP;
END $$;
