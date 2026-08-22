-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- ============================================================
-- Fase 1a: Trigger BEFORE UPDATE — etapa → status + booleans
-- ============================================================
CREATE OR REPLACE FUNCTION sync_lead_etapa_to_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.etapa_pipeline_id IS DISTINCT FROM OLD.etapa_pipeline_id THEN
    CASE NEW.etapa_pipeline_id
      WHEN 1, 2, 3, 4 THEN NEW.status := 'novo';
      WHEN 5 THEN
        NEW.status := 'experimental_agendada';
        NEW.experimental_agendada := true;
      WHEN 6 THEN NEW.status := 'visita_escola';
      WHEN 7 THEN
        NEW.status := 'experimental_realizada';
        NEW.experimental_agendada := true;
        NEW.experimental_realizada := true;
        NEW.faltou_experimental := false;
      WHEN 8 THEN
        NEW.status := 'experimental_realizada';
        NEW.experimental_agendada := true;
        NEW.experimental_realizada := true;
      WHEN 9 THEN
        NEW.status := 'experimental_faltou';
        NEW.experimental_agendada := true;
        NEW.faltou_experimental := true;
      WHEN 10 THEN
        NEW.status := 'convertido';
        NEW.converteu := true;
        NEW.data_conversao := COALESCE(NEW.data_conversao, CURRENT_DATE);
      WHEN 11 THEN
        NEW.status := 'arquivado';
        NEW.arquivado := true;
        NEW.data_arquivamento := COALESCE(NEW.data_arquivamento, CURRENT_DATE);
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sync_etapa_to_status
  BEFORE UPDATE ON leads FOR EACH ROW
  EXECUTE FUNCTION sync_lead_etapa_to_status();

-- ============================================================
-- Fase 1b: Trigger BEFORE INSERT — consistência em novos registros
-- ============================================================
CREATE OR REPLACE FUNCTION sync_lead_etapa_status_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.etapa_pipeline_id IS NULL THEN
    CASE NEW.status
      WHEN 'novo' THEN NEW.etapa_pipeline_id := 1;
      WHEN 'experimental_agendada' THEN NEW.etapa_pipeline_id := 5;
      WHEN 'visita_escola' THEN NEW.etapa_pipeline_id := 6;
      WHEN 'experimental_realizada' THEN NEW.etapa_pipeline_id := 7;
      WHEN 'experimental_faltou' THEN NEW.etapa_pipeline_id := 9;
      WHEN 'convertido', 'matriculado' THEN
        NEW.etapa_pipeline_id := 10;
        NEW.converteu := true;
        NEW.data_conversao := COALESCE(NEW.data_conversao, CURRENT_DATE);
      WHEN 'arquivado' THEN
        NEW.etapa_pipeline_id := 11;
        NEW.arquivado := true;
      ELSE NEW.etapa_pipeline_id := 1;
    END CASE;
  ELSE
    CASE NEW.etapa_pipeline_id
      WHEN 1, 2, 3, 4 THEN NEW.status := COALESCE(NULLIF(NEW.status, ''), 'novo');
      WHEN 5 THEN
        NEW.status := 'experimental_agendada';
        NEW.experimental_agendada := true;
      WHEN 6 THEN NEW.status := 'visita_escola';
      WHEN 7, 8 THEN
        NEW.status := 'experimental_realizada';
        NEW.experimental_agendada := true;
        NEW.experimental_realizada := true;
      WHEN 9 THEN
        NEW.status := 'experimental_faltou';
        NEW.faltou_experimental := true;
      WHEN 10 THEN
        NEW.status := 'convertido';
        NEW.converteu := true;
        NEW.data_conversao := COALESCE(NEW.data_conversao, CURRENT_DATE);
      WHEN 11 THEN
        NEW.status := 'arquivado';
        NEW.arquivado := true;
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sync_etapa_status_on_insert
  BEFORE INSERT ON leads FOR EACH ROW
  EXECUTE FUNCTION sync_lead_etapa_status_on_insert();

-- ============================================================
-- Fase 1c: Reconciliação de dados existentes
-- ============================================================

-- status=experimental_realizada mas etapa errada
UPDATE leads SET etapa_pipeline_id = 7, experimental_agendada = true, experimental_realizada = true
WHERE status = 'experimental_realizada' AND etapa_pipeline_id NOT IN (7, 8) AND NOT converteu;

-- status=experimental_faltou mas etapa=5
UPDATE leads SET etapa_pipeline_id = 9
WHERE status = 'experimental_faltou' AND etapa_pipeline_id != 9;

-- arquivado=true mas status/etapa não reflete
UPDATE leads SET etapa_pipeline_id = 11, status = 'arquivado'
WHERE arquivado = true AND etapa_pipeline_id NOT IN (11);

-- status=novo mas etapa=5 (CRM setou etapa sem status)
UPDATE leads SET status = 'experimental_agendada', experimental_agendada = true
WHERE status = 'novo' AND etapa_pipeline_id = 5;

-- status=convertido mas etapa errada
UPDATE leads SET etapa_pipeline_id = 10
WHERE status = 'convertido' AND etapa_pipeline_id NOT IN (10);

-- converteu=true mas etapa IS NULL
UPDATE leads SET etapa_pipeline_id = 10
WHERE converteu = true AND etapa_pipeline_id IS NULL;

-- converteu=true mas etapa diferente de 10
UPDATE leads SET etapa_pipeline_id = 10
WHERE converteu = true AND etapa_pipeline_id NOT IN (10);

-- etapa IS NULL (catch-all)
UPDATE leads SET etapa_pipeline_id = 1
WHERE etapa_pipeline_id IS NULL AND NOT converteu AND NOT arquivado;

-- ============================================================
-- Fase 1d: RPC para n8n (fallback por nome quando telefone é nulo)
-- ============================================================
CREATE OR REPLACE FUNCTION atualizar_lead_experimental(
  p_telefone TEXT,
  p_nome TEXT,
  p_unidade_id UUID,
  p_status TEXT DEFAULT 'experimental_agendada',
  p_etapa INTEGER DEFAULT 5,
  p_data_experimental DATE DEFAULT NULL,
  p_horario_experimental TIME DEFAULT NULL,
  p_professor_id INTEGER DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_lead_id INTEGER;
  v_tel_norm TEXT;
BEGIN
  v_tel_norm := regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g');

  -- Tentar por telefone primeiro
  IF length(v_tel_norm) >= 10 THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE telefone = v_tel_norm AND unidade_id = p_unidade_id AND NOT arquivado
    LIMIT 1;
  END IF;

  -- Fallback por nome
  IF v_lead_id IS NULL AND p_nome IS NOT NULL AND trim(p_nome) != '' THEN
    SELECT id INTO v_lead_id FROM leads
    WHERE lower(trim(nome)) = lower(trim(p_nome)) AND unidade_id = p_unidade_id AND NOT arquivado
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_lead_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'lead_not_found');
  END IF;

  UPDATE leads SET
    etapa_pipeline_id = p_etapa,
    data_experimental = COALESCE(p_data_experimental, data_experimental),
    horario_experimental = COALESCE(p_horario_experimental, horario_experimental),
    professor_experimental_id = COALESCE(p_professor_id, professor_experimental_id)
  WHERE id = v_lead_id;

  RETURN json_build_object('success', true, 'lead_id', v_lead_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
