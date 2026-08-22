-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Backfill: recalcular experimentais_mensal_unidade do zero a partir de leads
-- Corrige tanto undercounting (trigger não capturava UPDATE) quanto
-- overcounting (leads que mudaram status via UPDATE nunca foram decrementados)

DELETE FROM experimentais_mensal_unidade;

INSERT INTO experimentais_mensal_unidade (unidade_id, ano, mes, total_experimentais, total_matriculas)
SELECT
  unidade_id,
  EXTRACT(YEAR FROM data_contato)::INTEGER AS ano,
  EXTRACT(MONTH FROM data_contato)::INTEGER AS mes,
  COUNT(*) FILTER (WHERE status = 'experimental_realizada')::INTEGER AS total_experimentais,
  COUNT(*) FILTER (WHERE status IN ('matriculado','convertido'))::INTEGER AS total_matriculas
FROM leads
WHERE status IN ('experimental_realizada', 'matriculado', 'convertido')
  AND data_contato IS NOT NULL
GROUP BY unidade_id,
  EXTRACT(YEAR FROM data_contato), EXTRACT(MONTH FROM data_contato)
HAVING COUNT(*) FILTER (WHERE status = 'experimental_realizada') > 0
    OR COUNT(*) FILTER (WHERE status IN ('matriculado','convertido')) > 0;
