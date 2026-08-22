-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- View: Alertas de checklists com prazo vencendo
CREATE OR REPLACE VIEW vw_farmer_checklist_alertas AS
SELECT 
  c.id as checklist_id,
  c.titulo,
  c.descricao,
  c.data_prazo,
  c.prioridade,
  c.alerta_dias_antes,
  c.lembrete_whatsapp,
  c.colaborador_id,
  c.unidade_id,
  col.nome as colaborador_nome,
  col.apelido as colaborador_apelido,
  col.whatsapp as colaborador_whatsapp,
  COUNT(ci.id) as total_items,
  COUNT(ci.id) FILTER (WHERE ci.concluida = true) as items_concluidos,
  CASE 
    WHEN COUNT(ci.id) > 0 
    THEN ROUND((COUNT(ci.id) FILTER (WHERE ci.concluida = true)::NUMERIC / COUNT(ci.id)) * 100, 0)
    ELSE 0 
  END as percentual_progresso,
  c.data_prazo - CURRENT_DATE as dias_restantes,
  CASE 
    WHEN c.data_prazo < CURRENT_DATE THEN 'vencido'
    WHEN c.data_prazo - CURRENT_DATE <= c.alerta_dias_antes THEN 'urgente'
    WHEN c.data_prazo - CURRENT_DATE <= 7 THEN 'atencao'
    ELSE 'normal'
  END as urgencia
FROM farmer_checklists c
LEFT JOIN farmer_checklist_items ci ON ci.checklist_id = c.id
LEFT JOIN colaboradores col ON col.id = c.colaborador_id
WHERE c.status = 'ativo'
  AND c.ativo = true
  AND c.data_prazo IS NOT NULL
GROUP BY c.id, c.titulo, c.descricao, c.data_prazo, c.prioridade, 
         c.alerta_dias_antes, c.lembrete_whatsapp, c.colaborador_id, c.unidade_id,
         col.nome, col.apelido, col.whatsapp
ORDER BY 
  CASE 
    WHEN c.data_prazo < CURRENT_DATE THEN 0
    WHEN c.data_prazo - CURRENT_DATE <= c.alerta_dias_antes THEN 1
    ELSE 2
  END,
  c.data_prazo ASC;
