-- Fix da RPC executar_query_auditoria.
-- Versão original usava trim() que em PostgreSQL não remove newlines/tabs por padrão,
-- então queries com template literals (com \n inicial) eram rejeitadas.
-- Esta migration substitui por regexp_replace para garantir que qualquer whitespace
-- (incluindo \n, \t) seja considerado.

CREATE OR REPLACE FUNCTION public.executar_query_auditoria(p_sql TEXT)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lower TEXT;
BEGIN
  -- regexp_replace remove qualquer whitespace inicial/final (espaço, tab, newline)
  v_lower := lower(regexp_replace(p_sql, '^\s+|\s+$', '', 'g'));

  IF v_lower NOT LIKE 'select%' AND v_lower NOT LIKE 'with%' THEN
    RAISE EXCEPTION 'executar_query_auditoria: apenas SELECT/WITH permitido';
  END IF;
  IF position(';' IN v_lower) > 0 AND position(';' IN v_lower) < length(v_lower) - 1 THEN
    RAISE EXCEPTION 'executar_query_auditoria: statement chaining bloqueado';
  END IF;

  RETURN QUERY EXECUTE format('SELECT to_jsonb(t) FROM (%s) t', regexp_replace(p_sql, ';\s*$', '', 'g'));
END;
$$;

REVOKE ALL ON FUNCTION public.executar_query_auditoria(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executar_query_auditoria(TEXT) TO service_role;
