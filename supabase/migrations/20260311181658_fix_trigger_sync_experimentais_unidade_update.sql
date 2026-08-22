-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Fix: adicionar suporte a UPDATE no trigger sync_experimentais_unidade
-- Antes: só disparava em INSERT e DELETE → perdia updates de status
CREATE OR REPLACE FUNCTION sync_experimentais_unidade()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_mes INTEGER;
  v_delta_exp INTEGER := 0;
  v_delta_mat INTEGER := 0;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ano := EXTRACT(YEAR FROM OLD.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM OLD.data_contato)::INTEGER;

    IF OLD.status = 'experimental_realizada' THEN
      v_delta_exp := -COALESCE(OLD.quantidade, 1);
    ELSIF OLD.status IN ('matriculado','convertido') THEN
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

  ELSIF TG_OP = 'UPDATE' THEN
    v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;

    -- experimental_realizada: saiu
    IF OLD.status = 'experimental_realizada' AND NEW.status != 'experimental_realizada' THEN
      v_delta_exp := v_delta_exp - COALESCE(OLD.quantidade, 1);
    END IF;
    -- experimental_realizada: entrou
    IF NEW.status = 'experimental_realizada' AND OLD.status != 'experimental_realizada' THEN
      v_delta_exp := v_delta_exp + COALESCE(NEW.quantidade, 1);
    END IF;

    -- matriculado/convertido: saiu
    IF OLD.status IN ('matriculado','convertido') AND NEW.status NOT IN ('matriculado','convertido') THEN
      v_delta_mat := v_delta_mat - COALESCE(OLD.quantidade, 1);
    END IF;
    -- matriculado/convertido: entrou
    IF NEW.status IN ('matriculado','convertido') AND OLD.status NOT IN ('matriculado','convertido') THEN
      v_delta_mat := v_delta_mat + COALESCE(NEW.quantidade, 1);
    END IF;

    IF v_delta_exp != 0 OR v_delta_mat != 0 THEN
      INSERT INTO experimentais_mensal_unidade (unidade_id, ano, mes, total_experimentais, total_matriculas)
      VALUES (NEW.unidade_id, v_ano, v_mes, GREATEST(0, v_delta_exp), GREATEST(0, v_delta_mat))
      ON CONFLICT (unidade_id, ano, mes)
      DO UPDATE SET
        total_experimentais = GREATEST(0, experimentais_mensal_unidade.total_experimentais + v_delta_exp),
        total_matriculas = GREATEST(0, experimentais_mensal_unidade.total_matriculas + v_delta_mat);
    END IF;
    RETURN NEW;

  ELSE -- INSERT
    v_ano := EXTRACT(YEAR FROM NEW.data_contato)::INTEGER;
    v_mes := EXTRACT(MONTH FROM NEW.data_contato)::INTEGER;

    IF NEW.status = 'experimental_realizada' THEN
      v_delta_exp := COALESCE(NEW.quantidade, 1);
    ELSIF NEW.status IN ('matriculado','convertido') THEN
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

-- Recriar trigger com OR UPDATE OF status
DROP TRIGGER IF EXISTS tr_sync_experimentais_unidade ON leads;
CREATE TRIGGER tr_sync_experimentais_unidade
AFTER INSERT OR UPDATE OF status OR DELETE ON leads
FOR EACH ROW EXECUTE FUNCTION sync_experimentais_unidade();
