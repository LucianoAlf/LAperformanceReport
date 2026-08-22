-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- 9. RPC: calcular_health_score_alunos_batch
-- Calcula e atualiza o Health Score de todos os alunos ativos
-- =====================================================
CREATE OR REPLACE FUNCTION calcular_health_score_alunos_batch(p_unidade_id UUID DEFAULT NULL)
RETURNS TABLE(total_processados INTEGER, saudaveis INTEGER, atencao INTEGER, criticos INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER := 0;
  v_saudaveis INTEGER := 0;
  v_atencao INTEGER := 0;
  v_criticos INTEGER := 0;
  v_aluno RECORD;
  v_result RECORD;
BEGIN
  FOR v_aluno IN 
    SELECT id FROM alunos 
    WHERE status IN ('ativo', 'trancado')
      AND (p_unidade_id IS NULL OR unidade_id = p_unidade_id)
      AND (is_segundo_curso IS NULL OR is_segundo_curso = false)
  LOOP
    SELECT * INTO v_result FROM calcular_health_score_aluno(v_aluno.id);
    
    UPDATE alunos SET 
      health_score_numerico = v_result.score,
      health_score = v_result.status,
      health_score_updated_at = now()
    WHERE id = v_aluno.id;
    
    v_count := v_count + 1;
    
    IF v_result.status = 'saudavel' THEN
      v_saudaveis := v_saudaveis + 1;
    ELSIF v_result.status = 'atencao' THEN
      v_atencao := v_atencao + 1;
    ELSE
      v_criticos := v_criticos + 1;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_count, v_saudaveis, v_atencao, v_criticos;
END;
$$;

COMMENT ON FUNCTION calcular_health_score_alunos_batch IS 'Calcula e atualiza o Health Score de todos os alunos ativos (batch)';
