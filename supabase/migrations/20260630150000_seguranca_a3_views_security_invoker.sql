-- Auditoria de segurança — A3: 40 views SECURITY DEFINER (único bloco ERROR do advisor).
-- Views definer aplicam permissão/RLS do CRIADOR (postgres) ao consultar -> bypassam a RLS
-- das tabelas-base (vazamento cross-unidade em potencial). SET security_invoker=on faz a view
-- rodar com a permissão de QUEM consulta, aplicando a RLS das tabelas-base.
--
-- Seguro (verificado 2026-06-30): TODAS as tabelas-base das 40 views têm RLS ativa + policy
-- que 'authenticated' passa (USING(true)). Logo o resultado para usuários logados é idêntico
-- ao atual (nada some). Teste validado na vw_aluno_sucesso_lista (Sucesso do Aluno: 506 alunos
-- CG, mesmo topo). O isolamento real por unidade continua sendo a "camada 2" (refino das
-- policies USING(true)); isto aqui só fecha o ERROR e remove o bypass de definer.
-- Reversível: ALTER VIEW ... SET (security_invoker = off).
DO $$
DECLARE v text;
DECLARE views text[] := ARRAY[
  'vw_alertas_inteligentes','vw_aluno_sucesso_lista','vw_aluno_sucesso_resumo','vw_consolidado_anual',
  'vw_contagem_alunos','vw_dashboard_unidade','vw_distribuicao_permanencia','vw_evasoes_motivos',
  'vw_evasoes_professores','vw_evasoes_resumo','vw_fabio_aulas_contexto','vw_fabio_carteira_professor',
  'vw_farmer_aniversariantes_hoje','vw_farmer_checklist_alertas','vw_farmer_inadimplentes','vw_farmer_novos_matriculados',
  'vw_farmer_renovacoes_proximas','vw_farmer_resumo_alertas','vw_fator_demanda_professor','vw_kpis_comercial_mensal',
  'vw_kpis_gestao_mensal','vw_kpis_professor_historico','vw_kpis_professor_mensal','vw_kpis_professor_por_unidade',
  'vw_kpis_retencao_mensal','vw_leads_comercial','vw_ltv_por_categoria','vw_ltv_por_unidade',
  'vw_ltv_rede','vw_professores_carteira_resumo','vw_professores_emusys_vinculos','vw_professores_performance_atual',
  'vw_ranking_professores_evasoes','vw_ranking_unidades','vw_renovacoes_proximas','vw_taxa_crescimento_professor',
  'vw_totais_unidade_performance','vw_turmas_implicitas','vw_turmas_professor_periodo','vw_unidade_anual'];
BEGIN
  FOREACH v IN ARRAY views LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
  END LOOP;
END $$;
