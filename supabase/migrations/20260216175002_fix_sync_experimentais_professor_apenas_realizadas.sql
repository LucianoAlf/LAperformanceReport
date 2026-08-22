-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir trigger para contar apenas experimentais REALIZADAS por professor
CREATE OR REPLACE FUNCTION sync_experimentais_professor()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
  v_delta INTEGER;
  v_is_experimental_realizada BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data_contato)::INTEGER;
    v_delta := -COALESCE(OLD.quantidade, 1);
    -- CORREÇÃO: Apenas experimental_realizada conta
    v_is_experimental_realizada := OLD.status = 'experimental_realizada';
    
    IF v_is_experimental_realizada AND OLD.professor_experimental_id IS NOT NULL THEN
      UPDATE experimentais_professor_mensal
      SET experimentais = GREATEST(0, experimentais + v_delta)
      WHERE professor_id = OLD.professor_experimental_id 
        AND unidade_id = OLD.unidade_id 
        AND ano = v_ano 
        AND mes = v_mes;
    END IF;
    RETURN OLD;
  ELSE
    v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;
    v_delta := COALESCE(NEW.quantidade, 1);
    -- CORREÇÃO: Apenas experimental_realizada conta
    v_is_experimental_realizada := NEW.status = 'experimental_realizada';
    
    IF v_is_experimental_realizada AND NEW.professor_experimental_id IS NOT NULL THEN
      INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
      VALUES (NEW.professor_experimental_id, NEW.unidade_id, v_ano, v_mes, v_delta)
      ON CONFLICT (professor_id, unidade_id, ano, mes) 
      DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + v_delta;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
