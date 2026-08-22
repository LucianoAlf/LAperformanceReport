-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para atualizar configurações Fideliza+
CREATE OR REPLACE FUNCTION atualizar_config_fideliza(
  p_ano INTEGER,
  p_campo VARCHAR(100),
  p_valor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format(
    'UPDATE programa_fideliza_config SET %I = $1, updated_at = NOW() WHERE ano = $2',
    p_campo
  ) USING p_valor, p_ano;
  
  RETURN jsonb_build_object('success', true);
END;
$$;
