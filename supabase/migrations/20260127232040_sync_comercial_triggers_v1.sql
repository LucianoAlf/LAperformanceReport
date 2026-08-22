-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- MIGRAÇÃO: Sincronização Comercial - Opção 2.5
-- Data: 27/01/2026
-- Objetivo: Triggers em tempo real + Validação diária
-- =====================================================

-- =====================================================
-- 1. ADICIONAR COLUNAS AUXILIARES EM dados_comerciais
-- =====================================================
ALTER TABLE dados_comerciais 
ADD COLUMN IF NOT EXISTS soma_passaportes NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS qtd_matriculas_passaporte INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS soma_parcelas NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS qtd_matriculas_parcela INTEGER DEFAULT 0;

-- =====================================================
-- 2. FUNÇÃO PRINCIPAL: Sincronizar leads_diarios → dados_comerciais
-- =====================================================
CREATE OR REPLACE FUNCTION sync_leads_to_dados_comerciais()
RETURNS TRIGGER AS $$
DECLARE
  v_unidade_nome VARCHAR;
  v_competencia DATE;
  v_quantidade INTEGER;
  v_tipo VARCHAR;
  v_is_lamk BOOLEAN;
  v_valor_passaporte NUMERIC;
  v_valor_parcela NUMERIC;
  v_delta INTEGER;
BEGIN
  -- Determinar operação e valores
  IF TG_OP = 'DELETE' THEN
    v_competencia := DATE_TRUNC('month', OLD.data)::DATE;
    v_quantidade := OLD.quantidade;
    v_tipo := OLD.tipo;
    v_is_lamk := OLD.aluno_idade IS NOT NULL AND OLD.aluno_idade <= 11;
    v_valor_passaporte := COALESCE(OLD.valor_passaporte, 0);
    v_valor_parcela := COALESCE(OLD.valor_parcela, 0);
    v_delta := -1; -- Subtrair
    
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = OLD.unidade_id;
  ELSE
    v_competencia := DATE_TRUNC('month', NEW.data)::DATE;
    v_quantidade := NEW.quantidade;
    v_tipo := NEW.tipo;
    v_is_lamk := NEW.aluno_idade IS NOT NULL AND NEW.aluno_idade <= 11;
    v_valor_passaporte := COALESCE(NEW.valor_passaporte, 0);
    v_valor_parcela := COALESCE(NEW.valor_parcela, 0);
    v_delta := 1; -- Somar
    
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = NEW.unidade_id;
  END IF;

  -- Garantir que existe registro do mês
  INSERT INTO dados_comerciais (
    competencia, unidade, total_leads, aulas_experimentais, 
    novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla,
    ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte,
    soma_passaportes, qtd_matriculas_passaporte, soma_parcelas, qtd_matriculas_parcela
  ) VALUES (
    v_competencia, v_unidade_nome, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
  )
  ON CONFLICT (competencia, unidade) DO NOTHING;

  -- Atualizar contadores baseado no tipo
  IF v_tipo = 'lead' THEN
    UPDATE dados_comerciais 
    SET total_leads = GREATEST(0, total_leads + (v_quantidade * v_delta)),
        updated_at = NOW()
    WHERE competencia = v_competencia AND unidade = v_unidade_nome;
    
  ELSIF v_tipo = 'experimental' THEN
    UPDATE dados_comerciais 
    SET aulas_experimentais = GREATEST(0, aulas_experimentais + (v_quantidade * v_delta)),
        updated_at = NOW()
    WHERE competencia = v_competencia AND unidade = v_unidade_nome;
    
  ELSIF v_tipo = 'matricula' THEN
    -- Atualizar matrículas e valores
    UPDATE dados_comerciais 
    SET 
      novas_matriculas_total = GREATEST(0, novas_matriculas_total + (v_quantidade * v_delta)),
      novas_matriculas_lamk = CASE WHEN v_is_lamk THEN GREATEST(0, novas_matriculas_lamk + (v_quantidade * v_delta)) ELSE novas_matriculas_lamk END,
      novas_matriculas_emla = CASE WHEN NOT v_is_lamk THEN GREATEST(0, novas_matriculas_emla + (v_quantidade * v_delta)) ELSE novas_matriculas_emla END,
      -- Acumular valores para cálculo de média
      soma_passaportes = GREATEST(0, soma_passaportes + (v_valor_passaporte * v_delta)),
      qtd_matriculas_passaporte = CASE WHEN v_valor_passaporte > 0 THEN GREATEST(0, qtd_matriculas_passaporte + v_delta) ELSE qtd_matriculas_passaporte END,
      soma_parcelas = GREATEST(0, soma_parcelas + (v_valor_parcela * v_delta)),
      qtd_matriculas_parcela = CASE WHEN v_valor_parcela > 0 THEN GREATEST(0, qtd_matriculas_parcela + v_delta) ELSE qtd_matriculas_parcela END,
      -- Calcular médias
      ticket_medio_passaporte = CASE WHEN (qtd_matriculas_passaporte + CASE WHEN v_valor_passaporte > 0 THEN v_delta ELSE 0 END) > 0 
        THEN (soma_passaportes + (v_valor_passaporte * v_delta)) / NULLIF((qtd_matriculas_passaporte + CASE WHEN v_valor_passaporte > 0 THEN v_delta ELSE 0 END), 0)
        ELSE 0 END,
      ticket_medio_parcelas = CASE WHEN (qtd_matriculas_parcela + CASE WHEN v_valor_parcela > 0 THEN v_delta ELSE 0 END) > 0 
        THEN (soma_parcelas + (v_valor_parcela * v_delta)) / NULLIF((qtd_matriculas_parcela + CASE WHEN v_valor_parcela > 0 THEN v_delta ELSE 0 END), 0)
        ELSE 0 END,
      faturamento_passaporte = GREATEST(0, faturamento_passaporte + (v_valor_passaporte * v_delta)),
      updated_at = NOW()
    WHERE competencia = v_competencia AND unidade = v_unidade_nome;
  END IF;

  -- Retornar
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. FUNÇÃO: Sincronizar leads_diarios → origem_leads
-- =====================================================
CREATE OR REPLACE FUNCTION sync_leads_to_origem_leads()
RETURNS TRIGGER AS $$
DECLARE
  v_unidade_nome VARCHAR;
  v_canal_nome VARCHAR;
  v_competencia DATE;
  v_quantidade INTEGER;
  v_tipo VARCHAR;
  v_delta INTEGER;
BEGIN
  -- Determinar operação e valores
  IF TG_OP = 'DELETE' THEN
    v_competencia := DATE_TRUNC('month', OLD.data)::DATE;
    v_quantidade := OLD.quantidade;
    v_tipo := OLD.tipo;
    v_delta := -1;
    
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = OLD.unidade_id;
    SELECT nome INTO v_canal_nome FROM canais_origem WHERE id = OLD.canal_origem_id;
  ELSE
    v_competencia := DATE_TRUNC('month', NEW.data)::DATE;
    v_quantidade := NEW.quantidade;
    v_tipo := NEW.tipo;
    v_delta := 1;
    
    SELECT nome INTO v_unidade_nome FROM unidades WHERE id = NEW.unidade_id;
    SELECT nome INTO v_canal_nome FROM canais_origem WHERE id = NEW.canal_origem_id;
  END IF;

  -- Se não tem canal, não sincroniza para origem_leads
  IF v_canal_nome IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- UPSERT em origem_leads
  INSERT INTO origem_leads (competencia, unidade, canal, tipo, quantidade)
  VALUES (v_competencia, v_unidade_nome, v_canal_nome, v_tipo, v_quantidade * v_delta)
  ON CONFLICT (competencia, unidade, canal, tipo) 
  DO UPDATE SET 
    quantidade = GREATEST(0, origem_leads.quantidade + (v_quantidade * v_delta));

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. CRIAR TRIGGERS
-- =====================================================

-- Trigger para dados_comerciais
DROP TRIGGER IF EXISTS tr_sync_leads_comerciais ON leads_diarios;
CREATE TRIGGER tr_sync_leads_comerciais
  AFTER INSERT OR UPDATE OR DELETE ON leads_diarios
  FOR EACH ROW
  EXECUTE FUNCTION sync_leads_to_dados_comerciais();

-- Trigger para origem_leads
DROP TRIGGER IF EXISTS tr_sync_leads_origem ON leads_diarios;
CREATE TRIGGER tr_sync_leads_origem
  AFTER INSERT OR UPDATE OR DELETE ON leads_diarios
  FOR EACH ROW
  EXECUTE FUNCTION sync_leads_to_origem_leads();

-- =====================================================
-- 5. FUNÇÃO DE VALIDAÇÃO DIÁRIA (Recalcula do zero)
-- =====================================================
CREATE OR REPLACE FUNCTION validar_e_corrigir_dados_comerciais(p_ano INTEGER, p_mes INTEGER)
RETURNS TABLE (
  unidade VARCHAR,
  campo VARCHAR,
  valor_trigger NUMERIC,
  valor_calculado NUMERIC,
  diferenca_pct NUMERIC,
  corrigido BOOLEAN
) AS $$
DECLARE
  v_competencia DATE;
  r RECORD;
  v_calc_leads INTEGER;
  v_calc_exp INTEGER;
  v_calc_mat INTEGER;
  v_calc_lamk INTEGER;
  v_calc_emla INTEGER;
  v_calc_ticket_pass NUMERIC;
  v_calc_ticket_parc NUMERIC;
  v_calc_fat_pass NUMERIC;
BEGIN
  v_competencia := MAKE_DATE(p_ano, p_mes, 1);
  
  -- Para cada unidade
  FOR r IN SELECT DISTINCT u.nome as unidade_nome, u.id as unidade_id
           FROM unidades u
           WHERE u.ativo = true
  LOOP
    -- Calcular valores do zero a partir de leads_diarios
    SELECT 
      COALESCE(SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'experimental' THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' AND aluno_idade <= 11 THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' AND (aluno_idade > 11 OR aluno_idade IS NULL) THEN quantidade ELSE 0 END), 0),
      COALESCE(AVG(CASE WHEN tipo = 'matricula' AND valor_passaporte > 0 THEN valor_passaporte END), 0),
      COALESCE(AVG(CASE WHEN tipo = 'matricula' AND valor_parcela > 0 THEN valor_parcela END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN valor_passaporte ELSE 0 END), 0)
    INTO v_calc_leads, v_calc_exp, v_calc_mat, v_calc_lamk, v_calc_emla, 
         v_calc_ticket_pass, v_calc_ticket_parc, v_calc_fat_pass
    FROM leads_diarios
    WHERE unidade_id = r.unidade_id
      AND DATE_TRUNC('month', data) = v_competencia;

    -- Comparar com dados_comerciais e corrigir se diferença > 1%
    UPDATE dados_comerciais dc
    SET 
      total_leads = v_calc_leads,
      aulas_experimentais = v_calc_exp,
      novas_matriculas_total = v_calc_mat,
      novas_matriculas_lamk = v_calc_lamk,
      novas_matriculas_emla = v_calc_emla,
      ticket_medio_passaporte = v_calc_ticket_pass,
      ticket_medio_parcelas = v_calc_ticket_parc,
      faturamento_passaporte = v_calc_fat_pass,
      updated_at = NOW()
    WHERE dc.competencia = v_competencia 
      AND dc.unidade = r.unidade_nome
      AND (
        ABS(dc.total_leads - v_calc_leads) > 0 OR
        ABS(dc.aulas_experimentais - v_calc_exp) > 0 OR
        ABS(dc.novas_matriculas_total - v_calc_mat) > 0
      );

    -- Retornar diferenças encontradas
    RETURN QUERY
    SELECT 
      r.unidade_nome::VARCHAR,
      'total_leads'::VARCHAR,
      dc.total_leads::NUMERIC,
      v_calc_leads::NUMERIC,
      CASE WHEN dc.total_leads > 0 THEN ABS(dc.total_leads - v_calc_leads) / dc.total_leads * 100 ELSE 0 END,
      (dc.total_leads != v_calc_leads)
    FROM dados_comerciais dc
    WHERE dc.competencia = v_competencia AND dc.unidade = r.unidade_nome;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. VALIDAÇÃO DA MIGRAÇÃO
-- =====================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_sync_leads_comerciais') THEN
    RAISE NOTICE '✅ Trigger tr_sync_leads_comerciais criado';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_sync_leads_origem') THEN
    RAISE NOTICE '✅ Trigger tr_sync_leads_origem criado';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validar_e_corrigir_dados_comerciais') THEN
    RAISE NOTICE '✅ Função de validação diária criada';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ MIGRAÇÃO COMERCIAL CONCLUÍDA';
  RAISE NOTICE '========================================';
END $$;
