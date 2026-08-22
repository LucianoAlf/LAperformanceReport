-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para registrar penalidade Fideliza+
CREATE OR REPLACE FUNCTION registrar_penalidade_fideliza(
  p_ano INTEGER,
  p_trimestre INTEGER,
  p_unidade_id UUID,
  p_tipo VARCHAR(50),
  p_descricao TEXT,
  p_pontos INTEGER,
  p_data_ocorrencia DATE,
  p_registrado_por VARCHAR(100)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  INSERT INTO programa_fideliza_penalidades (
    ano, trimestre, unidade_id, tipo, descricao, pontos_descontados, data_ocorrencia, registrado_por
  ) VALUES (
    p_ano, p_trimestre, p_unidade_id, p_tipo, p_descricao, p_pontos, p_data_ocorrencia, p_registrado_por
  )
  RETURNING id INTO v_id;
  
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;
