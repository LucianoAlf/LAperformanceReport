-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION registrar_penalidade_matriculador(p_ano INTEGER, p_unidade_id UUID, p_tipo VARCHAR(50), p_descricao TEXT, p_pontos INTEGER, p_data_ocorrencia DATE, p_registrado_por VARCHAR(100))
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id INTEGER;
BEGIN
  INSERT INTO programa_matriculador_penalidades (ano, unidade_id, tipo, descricao, pontos_descontados, data_ocorrencia, registrado_por)
  VALUES (p_ano, p_unidade_id, p_tipo, p_descricao, p_pontos, p_data_ocorrencia, p_registrado_por) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION deletar_penalidade_matriculador(p_id INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM programa_matriculador_penalidades WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION atualizar_config_matriculador(p_ano INTEGER, p_config JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE programa_matriculador_config SET 
    taxa_showup_experimental = COALESCE((p_config->'metas'->>'taxa_showup_experimental')::decimal, taxa_showup_experimental),
    taxa_experimental_matricula = COALESCE((p_config->'metas'->>'taxa_experimental_matricula')::decimal, taxa_experimental_matricula),
    taxa_lead_matricula = COALESCE((p_config->'metas'->>'taxa_lead_matricula')::decimal, taxa_lead_matricula),
    nota_corte = COALESCE((p_config->>'nota_corte')::int, nota_corte),
    updated_at = NOW()
  WHERE ano = p_ano;
  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_penalidade_matriculador TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deletar_penalidade_matriculador TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION atualizar_config_matriculador TO authenticated, service_role;
