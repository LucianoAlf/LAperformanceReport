-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir função sync_experimentais_professor para usar professor_experimental_id em vez de professor_id
CREATE OR REPLACE FUNCTION sync_experimentais_professor()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
  v_delta INTEGER;
BEGIN
  -- Determinar operação
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data)::INTEGER;
    v_delta := -COALESCE(OLD.quantidade, 1);
    
    -- Só processa se for experimental e tiver professor
    IF OLD.tipo LIKE 'experimental%' AND OLD.professor_experimental_id IS NOT NULL THEN
      UPDATE experimentais_professor_mensal
      SET experimentais = GREATEST(0, experimentais + v_delta)
      WHERE professor_id = OLD.professor_experimental_id 
        AND unidade_id = OLD.unidade_id 
        AND ano = v_ano 
        AND mes = v_mes;
    END IF;
    
    RETURN OLD;
  ELSE
    v_ano := EXTRACT(YEAR FROM NEW.data)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data)::INTEGER;
    v_delta := COALESCE(NEW.quantidade, 1);
    
    -- Só processa se for experimental e tiver professor
    IF NEW.tipo LIKE 'experimental%' AND NEW.professor_experimental_id IS NOT NULL THEN
      INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
      VALUES (NEW.professor_experimental_id, NEW.unidade_id, v_ano, v_mes, v_delta)
      ON CONFLICT (professor_id, unidade_id, ano, mes) 
      DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + v_delta;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
