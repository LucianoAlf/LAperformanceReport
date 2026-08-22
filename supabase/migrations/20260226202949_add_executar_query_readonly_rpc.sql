-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION executar_query_readonly(query_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  resultado jsonb;
BEGIN
  -- Validação: somente SELECT
  IF NOT (trim(query_sql) ~* '^\s*SELECT') THEN
    RAISE EXCEPTION 'Apenas consultas SELECT são permitidas';
  END IF;

  -- Bloquear palavras-chave perigosas
  IF query_sql ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)\b' THEN
    RAISE EXCEPTION 'Operação não permitida. Apenas SELECT.';
  END IF;

  -- Executar com limite de 50 linhas
  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s LIMIT 50) t', query_sql)
    INTO resultado;

  RETURN COALESCE(resultado, '[]'::jsonb);
END;
$$;
