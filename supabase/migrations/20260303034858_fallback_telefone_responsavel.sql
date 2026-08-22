-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- 1. Alterar função calcular_campos_aluno() para incluir fallback de telefone
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

  -- Fallback: usar telefone do responsável quando aluno não tem telefone
  IF (NEW.telefone IS NULL OR TRIM(NEW.telefone) = '')
     AND NEW.responsavel_telefone IS NOT NULL
     AND TRIM(NEW.responsavel_telefone) != '' THEN
    NEW.telefone := NEW.responsavel_telefone;
  END IF;
  
  -- Atualizar updated_at
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Atualizar registros existentes
UPDATE alunos
SET telefone = responsavel_telefone
WHERE (telefone IS NULL OR TRIM(telefone) = '')
  AND responsavel_telefone IS NOT NULL
  AND TRIM(responsavel_telefone) != '';
