-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Backfill: recalcular experimentais_professor_mensal do zero a partir de leads
-- Necessário porque o trigger não capturava UPDATEs anteriores

-- Zerar e reinserir apenas as linhas divergentes (não truncar tudo — preserva outros dados se houver)
DELETE FROM experimentais_professor_mensal;

INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
SELECT
  professor_experimental_id AS professor_id,
  unidade_id,
  EXTRACT(YEAR FROM data_contato)::INTEGER AS ano,
  EXTRACT(MONTH FROM data_contato)::INTEGER AS mes,
  COUNT(*)::INTEGER AS experimentais
FROM leads
WHERE status = 'experimental_realizada'
  AND professor_experimental_id IS NOT NULL
  AND data_contato IS NOT NULL
GROUP BY professor_experimental_id, unidade_id,
  EXTRACT(YEAR FROM data_contato), EXTRACT(MONTH FROM data_contato);
