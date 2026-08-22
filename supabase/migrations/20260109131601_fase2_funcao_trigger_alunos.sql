-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- 2. FUNÇÃO PARA CALCULAR CAMPOS AUTOMÁTICOS
CREATE OR REPLACE FUNCTION calcular_campos_aluno()
RETURNS TRIGGER AS $$
BEGIN
  -- Calcular idade e classificação EMLA/LAMK
  IF NEW.data_nascimento IS NOT NULL THEN
    NEW.idade_atual := EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.data_nascimento))::INTEGER;
    NEW.classificacao := CASE 
      WHEN NEW.idade_atual < 12 THEN 'LAMK' 
      ELSE 'EMLA' 
    END;
  ELSE
    NEW.idade_atual := NULL;
    NEW.classificacao := NULL;
  END IF;
  
  -- Calcular tempo de permanência em meses
  IF NEW.data_matricula IS NOT NULL THEN
    IF NEW.data_saida IS NOT NULL THEN
      NEW.tempo_permanencia_meses := (
        EXTRACT(YEAR FROM AGE(NEW.data_saida, NEW.data_matricula)) * 12 +
        EXTRACT(MONTH FROM AGE(NEW.data_saida, NEW.data_matricula))
      )::INTEGER;
    ELSE
      NEW.tempo_permanencia_meses := (
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.data_matricula)) * 12 +
        EXTRACT(MONTH FROM AGE(CURRENT_DATE, NEW.data_matricula))
      )::INTEGER;
    END IF;
  ELSE
    NEW.tempo_permanencia_meses := NULL;
  END IF;
  
  -- Atualizar updated_at
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. TRIGGER
DROP TRIGGER IF EXISTS trg_alunos_calcular_campos ON alunos;
CREATE TRIGGER trg_alunos_calcular_campos
  BEFORE INSERT OR UPDATE ON alunos
  FOR EACH ROW
  EXECUTE FUNCTION calcular_campos_aluno();
