-- C1 Sprint 5: leitura/KPIs (28 funções) — revoga PUBLIC/anon.
-- Mantém authenticated (front), service_role (edges/relatórios), postgres,
-- e maria_lareport_rpc nas 6 que têm grant explícito (agente BI Maria).
-- Verificado: nenhuma das 28 é usada em policy RLS.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'get_kpis_consolidados','get_kpis_evolucao_mensal','get_kpis_experimentais_professor','get_kpis_unidade',
      'get_historico_ltv','get_tempo_permanencia','get_resumo_renovacoes_proximas','get_faltas_periodo',
      'get_timeline_pesquisas_aluno','get_conciliacao_matriculas','get_conciliacao_professores_emusys','get_divergencias_alunos',
      'get_dados_relatorio_coordenacao','get_checklist_detail','get_historico_rotinas','get_progresso_rotinas_hoje',
      'get_rotinas_do_dia','get_programa_fideliza_dados','get_cron_health','get_fabio_aulas_do_professor',
      'auditar_saude_conversas','calcular_tempo_medio_resposta_crm','rpc_analise_turmas','buscar_anamnese_pendente',
      'buscar_anamneses_pendentes','buscar_anamneses_pendentes_todas','buscar_produto_fuzzy','buscar_video_professor'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
  END LOOP;
END $$;
