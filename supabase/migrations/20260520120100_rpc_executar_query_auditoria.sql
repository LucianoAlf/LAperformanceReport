-- RPC para auditor-divergencias-emusys executar queries SELECT dinâmicas.
-- SECURITY DEFINER restrito a service_role (edge function autenticada).

CREATE OR REPLACE FUNCTION public.executar_query_auditoria(p_sql TEXT)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lower TEXT;
BEGIN
  v_lower := lower(trim(p_sql));
  IF v_lower NOT LIKE 'select%' AND v_lower NOT LIKE 'with%' THEN
    RAISE EXCEPTION 'executar_query_auditoria: apenas SELECT/WITH permitido';
  END IF;
  IF position(';' IN v_lower) > 0 AND position(';' IN v_lower) < length(v_lower) - 1 THEN
    RAISE EXCEPTION 'executar_query_auditoria: statement chaining bloqueado';
  END IF;

  RETURN QUERY EXECUTE format('SELECT to_jsonb(t) FROM (%s) t', regexp_replace(p_sql, ';\s*$', ''));
END;
$$;

REVOKE ALL ON FUNCTION public.executar_query_auditoria(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.executar_query_auditoria(TEXT) TO service_role;

COMMENT ON FUNCTION public.executar_query_auditoria IS
'Executa SELECT/WITH dinâmico para o auditor de divergências. Restrito a service_role.';
