-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Configurar views com security_invoker = true (Parte 1)
-- Isso faz com que as views respeitem as policies RLS das tabelas base

ALTER VIEW vw_alertas SET (security_invoker = true);
ALTER VIEW vw_alunos_ativos SET (security_invoker = true);
ALTER VIEW vw_consolidado_anual SET (security_invoker = true);
ALTER VIEW vw_contagem_alunos SET (security_invoker = true);
ALTER VIEW vw_dashboard_unidade SET (security_invoker = true);
ALTER VIEW vw_distribuicao_permanencia SET (security_invoker = true);
ALTER VIEW vw_evasao_por_motivo SET (security_invoker = true);
ALTER VIEW vw_evasao_por_tipo SET (security_invoker = true);
ALTER VIEW vw_evasoes_motivos SET (security_invoker = true);
ALTER VIEW vw_evasoes_professores SET (security_invoker = true);
ALTER VIEW vw_evasoes_resumo SET (security_invoker = true);
ALTER VIEW vw_evolucao_alunos SET (security_invoker = true);
ALTER VIEW vw_funil_conversao_mensal SET (security_invoker = true);
ALTER VIEW vw_kpis_comercial_historico SET (security_invoker = true);
ALTER VIEW vw_kpis_comercial_mensal SET (security_invoker = true);
ALTER VIEW vw_kpis_gestao_mensal SET (security_invoker = true);
ALTER VIEW vw_kpis_mensais SET (security_invoker = true);
ALTER VIEW vw_kpis_professor_completo SET (security_invoker = true);
ALTER VIEW vw_kpis_professor_historico SET (security_invoker = true);
ALTER VIEW vw_kpis_professor_mensal SET (security_invoker = true);
