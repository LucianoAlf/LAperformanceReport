-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Trigger para sincronizar experimentais de leads_diarios para experimentais_professor_mensal
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
    IF OLD.tipo LIKE 'experimental%' AND OLD.professor_id IS NOT NULL THEN
      UPDATE experimentais_professor_mensal
      SET experimentais = GREATEST(0, experimentais + v_delta)
      WHERE professor_id = OLD.professor_id 
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
    IF NEW.tipo LIKE 'experimental%' AND NEW.professor_id IS NOT NULL THEN
      INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
      VALUES (NEW.professor_id, NEW.unidade_id, v_ano, v_mes, v_delta)
      ON CONFLICT (professor_id, unidade_id, ano, mes) 
      DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + v_delta;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger para sincronizar experimentais por unidade
CREATE OR REPLACE FUNCTION sync_experimentais_unidade()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
  v_delta_exp INTEGER := 0;
  v_delta_mat INTEGER := 0;
BEGIN
  -- Determinar operação
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data)::INTEGER;
    
    IF OLD.tipo LIKE 'experimental%' THEN
      v_delta_exp := -COALESCE(OLD.quantidade, 1);
    ELSIF OLD.tipo = 'matricula' THEN
      v_delta_mat := -COALESCE(OLD.quantidade, 1);
    END IF;
    
    IF v_delta_exp != 0 OR v_delta_mat != 0 THEN
      UPDATE experimentais_mensal_unidade
      SET 
        total_experimentais = GREATEST(0, total_experimentais + v_delta_exp),
        total_matriculas = GREATEST(0, total_matriculas + v_delta_mat)
      WHERE unidade_id = OLD.unidade_id AND ano = v_ano AND mes = v_mes;
    END IF;
    
    RETURN OLD;
  ELSE
    v_ano := EXTRACT(YEAR FROM NEW.data)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data)::INTEGER;
    
    IF NEW.tipo LIKE 'experimental%' THEN
      v_delta_exp := COALESCE(NEW.quantidade, 1);
    ELSIF NEW.tipo = 'matricula' THEN
      v_delta_mat := COALESCE(NEW.quantidade, 1);
    END IF;
    
    IF v_delta_exp != 0 OR v_delta_mat != 0 THEN
      INSERT INTO experimentais_mensal_unidade (unidade_id, ano, mes, total_experimentais, total_matriculas)
      VALUES (NEW.unidade_id, v_ano, v_mes, GREATEST(0, v_delta_exp), GREATEST(0, v_delta_mat))
      ON CONFLICT (unidade_id, ano, mes) 
      DO UPDATE SET 
        total_experimentais = experimentais_mensal_unidade.total_experimentais + v_delta_exp,
        total_matriculas = experimentais_mensal_unidade.total_matriculas + v_delta_mat;
    END IF;
    
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers
DROP TRIGGER IF EXISTS tr_sync_experimentais_professor ON leads_diarios;
CREATE TRIGGER tr_sync_experimentais_professor
  AFTER INSERT OR DELETE ON leads_diarios
  FOR EACH ROW
  EXECUTE FUNCTION sync_experimentais_professor();

DROP TRIGGER IF EXISTS tr_sync_experimentais_unidade ON leads_diarios;
CREATE TRIGGER tr_sync_experimentais_unidade
  AFTER INSERT OR DELETE ON leads_diarios
  FOR EACH ROW
  EXECUTE FUNCTION sync_experimentais_unidade();
