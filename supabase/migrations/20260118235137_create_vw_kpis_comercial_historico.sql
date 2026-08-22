-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- View para KPIs comerciais históricos (dados de 2025)
CREATE OR REPLACE VIEW vw_kpis_comercial_historico AS
SELECT 
  dc.id,
  dc.competencia,
  dc.unidade as unidade_nome,
  u.id as unidade_id,
  EXTRACT(year FROM dc.competencia)::integer as ano,
  EXTRACT(month FROM dc.competencia)::integer as mes,
  dc.total_leads,
  dc.aulas_experimentais as experimentais_realizadas,
  dc.novas_matriculas_total,
  dc.novas_matriculas_lamk,
  dc.novas_matriculas_emla,
  dc.ticket_medio_parcelas,
  dc.ticket_medio_passaporte,
  dc.faturamento_passaporte,
  -- Taxas calculadas
  CASE WHEN dc.total_leads > 0 
    THEN ROUND((dc.aulas_experimentais::numeric / dc.total_leads) * 100, 1) 
    ELSE 0 END as taxa_lead_exp,
  CASE WHEN dc.aulas_experimentais > 0 
    THEN ROUND((dc.novas_matriculas_total::numeric / dc.aulas_experimentais) * 100, 1) 
    ELSE 0 END as taxa_exp_mat,
  CASE WHEN dc.total_leads > 0 
    THEN ROUND((dc.novas_matriculas_total::numeric / dc.total_leads) * 100, 1) 
    ELSE 0 END as taxa_lead_mat
FROM dados_comerciais dc
LEFT JOIN unidades u ON UPPER(u.nome) = UPPER(dc.unidade)
ORDER BY dc.competencia DESC, dc.unidade;
