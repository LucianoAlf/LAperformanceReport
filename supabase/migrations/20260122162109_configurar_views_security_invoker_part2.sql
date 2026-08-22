-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Configurar views com security_invoker = true (Parte 2)
ALTER VIEW vw_kpis_retencao_mensal SET (security_invoker = true);
ALTER VIEW vw_leads_por_canal SET (security_invoker = true);
ALTER VIEW vw_ltv_por_categoria SET (security_invoker = true);
ALTER VIEW vw_ltv_por_unidade SET (security_invoker = true);
ALTER VIEW vw_ltv_rede SET (security_invoker = true);
ALTER VIEW vw_ltv_unidade SET (security_invoker = true);
ALTER VIEW vw_matriculas_por_canal SET (security_invoker = true);
ALTER VIEW vw_metas_vs_realizado SET (security_invoker = true);
ALTER VIEW vw_motivos_nao_matricula SET (security_invoker = true);
ALTER VIEW vw_movimentacoes_mensal SET (security_invoker = true);
ALTER VIEW vw_movimentacoes_recentes SET (security_invoker = true);
ALTER VIEW vw_performance_professor_experimental SET (security_invoker = true);
ALTER VIEW vw_projecao_metas SET (security_invoker = true);
ALTER VIEW vw_ranking_professores_evasoes SET (security_invoker = true);
ALTER VIEW vw_ranking_professores_retencao SET (security_invoker = true);
ALTER VIEW vw_ranking_unidades SET (security_invoker = true);
ALTER VIEW vw_renovacoes_mensal SET (security_invoker = true);
ALTER VIEW vw_renovacoes_pendentes SET (security_invoker = true);
ALTER VIEW vw_sazonalidade SET (security_invoker = true);
ALTER VIEW vw_totais_unidade_performance SET (security_invoker = true);
ALTER VIEW vw_unidade_anual SET (security_invoker = true);
