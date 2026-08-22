-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir vw_evasoes_professores para excluir Transferência (tipo 4) e Aviso Prévio (tipo 3)
CREATE OR REPLACE VIEW vw_evasoes_professores AS
WITH evasoes_unificadas AS (
  SELECT 
    unidade,
    professor,
    parcela,
    motivo_categoria
  FROM evasoes_legacy
  WHERE professor IS NOT NULL 
    AND professor <> '' 
    AND professor <> 'Desconhecido'
  UNION ALL
  SELECT 
    u.nome AS unidade,
    p.nome AS professor,
    e.valor_parcela AS parcela,
    ms.categoria AS motivo_categoria
  FROM evasoes_v2 e
  LEFT JOIN unidades u ON u.id = e.unidade_id
  LEFT JOIN professores p ON p.id = e.professor_id
  LEFT JOIN motivos_saida ms ON ms.id = e.motivo_saida_id
  WHERE e.professor_id IS NOT NULL
    AND e.tipo_saida_id IN (1, 2) -- Apenas Cancelamentos e Não Renovações
)
SELECT 
  unidade,
  professor,
  COUNT(*) AS total_evasoes,
  SUM(parcela) AS mrr_perdido,
  ROUND(AVG(parcela), 2) AS ticket_medio,
  MODE() WITHIN GROUP (ORDER BY motivo_categoria) AS motivo_principal
FROM evasoes_unificadas
GROUP BY unidade, professor
ORDER BY COUNT(*) DESC;
