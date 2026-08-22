-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Fix: adicionar suporte a UPDATE no trigger sync_experimentais_professor
-- Antes: só disparava em INSERT e DELETE → perdia updates de status para experimental_realizada
CREATE OR REPLACE FUNCTION sync_experimentais_professor()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data_contato)::INTEGER;

    IF OLD.status = 'experimental_realizada' AND OLD.professor_experimental_id IS NOT NULL THEN
      UPDATE experimentais_professor_mensal
      SET experimentais = GREATEST(0, experimentais - COALESCE(OLD.quantidade, 1))
      WHERE professor_id = OLD.professor_experimental_id
        AND unidade_id = OLD.unidade_id
        AND ano = v_ano
        AND mes = v_mes;
    END IF;
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status saiu de experimental_realizada: remover contagem do professor antigo
    IF OLD.status = 'experimental_realizada' AND NEW.status != 'experimental_realizada' THEN
      v_ano := EXTRACT(YEAR FROM OLD.data_contato)::INTEGER;
      v_mes := EXTRACT(MONTH FROM OLD.data_contato)::INTEGER;
      IF OLD.professor_experimental_id IS NOT NULL THEN
        UPDATE experimentais_professor_mensal
        SET experimentais = GREATEST(0, experimentais - COALESCE(OLD.quantidade, 1))
        WHERE professor_id = OLD.professor_experimental_id
          AND unidade_id = OLD.unidade_id
          AND ano = v_ano AND mes = v_mes;
      END IF;
    END IF;

    -- Status entrou em experimental_realizada: adicionar contagem ao professor novo
    IF NEW.status = 'experimental_realizada' AND OLD.status != 'experimental_realizada' THEN
      v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
      v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;
      IF NEW.professor_experimental_id IS NOT NULL THEN
        INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
        VALUES (NEW.professor_experimental_id, NEW.unidade_id, v_ano, v_mes, COALESCE(NEW.quantidade, 1))
        ON CONFLICT (professor_id, unidade_id, ano, mes)
        DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + COALESCE(NEW.quantidade, 1);
      END IF;
    END IF;

    -- Ambos experimental_realizada mas professor mudou: mover contagem
    IF NEW.status = 'experimental_realizada' AND OLD.status = 'experimental_realizada'
       AND OLD.professor_experimental_id IS DISTINCT FROM NEW.professor_experimental_id THEN
      v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
      v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;
      IF OLD.professor_experimental_id IS NOT NULL THEN
        UPDATE experimentais_professor_mensal
        SET experimentais = GREATEST(0, experimentais - COALESCE(OLD.quantidade, 1))
        WHERE professor_id = OLD.professor_experimental_id
          AND unidade_id = OLD.unidade_id
          AND ano = v_ano AND mes = v_mes;
      END IF;
      IF NEW.professor_experimental_id IS NOT NULL THEN
        INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
        VALUES (NEW.professor_experimental_id, NEW.unidade_id, v_ano, v_mes, COALESCE(NEW.quantidade, 1))
        ON CONFLICT (professor_id, unidade_id, ano, mes)
        DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + COALESCE(NEW.quantidade, 1);
      END IF;
    END IF;

    RETURN NEW;

  ELSE -- INSERT
    v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;

    IF NEW.status = 'experimental_realizada' AND NEW.professor_experimental_id IS NOT NULL THEN
      INSERT INTO experimentais_professor_mensal (professor_id, unidade_id, ano, mes, experimentais)
      VALUES (NEW.professor_experimental_id, NEW.unidade_id, v_ano, v_mes, COALESCE(NEW.quantidade, 1))
      ON CONFLICT (professor_id, unidade_id, ano, mes)
      DO UPDATE SET experimentais = experimentais_professor_mensal.experimentais + COALESCE(NEW.quantidade, 1);
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Recriar trigger com OR UPDATE OF status, professor_experimental_id
DROP TRIGGER IF EXISTS tr_sync_experimentais_professor ON leads;
CREATE TRIGGER tr_sync_experimentais_professor
AFTER INSERT OR UPDATE OF status, professor_experimental_id OR DELETE ON leads
FOR EACH ROW EXECUTE FUNCTION sync_experimentais_professor();
