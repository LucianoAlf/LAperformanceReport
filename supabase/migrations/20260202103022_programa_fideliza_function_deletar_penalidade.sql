-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para deletar penalidade Fideliza+
CREATE OR REPLACE FUNCTION deletar_penalidade_fideliza(p_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM programa_fideliza_penalidades WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
