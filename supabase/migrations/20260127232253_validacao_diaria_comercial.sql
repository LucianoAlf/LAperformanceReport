-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- =====================================================
-- FUNÇÃO DE VALIDAÇÃO DIÁRIA SIMPLIFICADA
-- Recalcula totais do zero e corrige se necessário
-- =====================================================

-- Remover função anterior com erro
DROP FUNCTION IF EXISTS validar_e_corrigir_dados_comerciais(INTEGER, INTEGER);

-- Criar função simplificada
CREATE OR REPLACE FUNCTION consolidar_dados_comerciais_mes(p_ano INTEGER, p_mes INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_competencia DATE;
  v_unidade RECORD;
  v_corrigidos INTEGER := 0;
BEGIN
  v_competencia := MAKE_DATE(p_ano, p_mes, 1);
  
  -- Para cada unidade ativa
  FOR v_unidade IN SELECT id, nome FROM unidades WHERE ativo = true
  LOOP
    -- UPSERT com valores calculados do zero
    INSERT INTO dados_comerciais (
      competencia, unidade, total_leads, aulas_experimentais, 
      novas_matriculas_total, novas_matriculas_lamk, novas_matriculas_emla,
      ticket_medio_parcelas, ticket_medio_passaporte, faturamento_passaporte,
      soma_passaportes, qtd_matriculas_passaporte, soma_parcelas, qtd_matriculas_parcela
    )
    SELECT 
      v_competencia,
      v_unidade.nome,
      COALESCE(SUM(CASE WHEN tipo = 'lead' THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'experimental' THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' AND aluno_idade <= 11 THEN quantidade ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' AND (aluno_idade > 11 OR aluno_idade IS NULL) THEN quantidade ELSE 0 END), 0),
      COALESCE(AVG(CASE WHEN tipo = 'matricula' AND valor_parcela > 0 THEN valor_parcela END), 0),
      COALESCE(AVG(CASE WHEN tipo = 'matricula' AND valor_passaporte > 0 THEN valor_passaporte END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN COALESCE(valor_passaporte, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN COALESCE(valor_passaporte, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' AND valor_passaporte > 0 THEN 1 ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' THEN COALESCE(valor_parcela, 0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN tipo = 'matricula' AND valor_parcela > 0 THEN 1 ELSE 0 END), 0)
    FROM leads_diarios
    WHERE unidade_id = v_unidade.id 
      AND DATE_TRUNC('month', data) = v_competencia
    ON CONFLICT (competencia, unidade) 
    DO UPDATE SET
      total_leads = EXCLUDED.total_leads,
      aulas_experimentais = EXCLUDED.aulas_experimentais,
      novas_matriculas_total = EXCLUDED.novas_matriculas_total,
      novas_matriculas_lamk = EXCLUDED.novas_matriculas_lamk,
      novas_matriculas_emla = EXCLUDED.novas_matriculas_emla,
      ticket_medio_parcelas = EXCLUDED.ticket_medio_parcelas,
      ticket_medio_passaporte = EXCLUDED.ticket_medio_passaporte,
      faturamento_passaporte = EXCLUDED.faturamento_passaporte,
      soma_passaportes = EXCLUDED.soma_passaportes,
      qtd_matriculas_passaporte = EXCLUDED.qtd_matriculas_passaporte,
      soma_parcelas = EXCLUDED.soma_parcelas,
      qtd_matriculas_parcela = EXCLUDED.qtd_matriculas_parcela,
      updated_at = NOW();
    
    v_corrigidos := v_corrigidos + 1;
  END LOOP;
  
  RETURN format('Consolidação concluída: %s unidades processadas para %s/%s', v_corrigidos, p_mes, p_ano);
END;
$$ LANGUAGE plpgsql;

-- Criar função para consolidar origem_leads também
CREATE OR REPLACE FUNCTION consolidar_origem_leads_mes(p_ano INTEGER, p_mes INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_competencia DATE;
  v_processados INTEGER := 0;
BEGIN
  v_competencia := MAKE_DATE(p_ano, p_mes, 1);
  
  -- Deletar registros existentes do mês (para recalcular)
  DELETE FROM origem_leads WHERE competencia = v_competencia;
  
  -- Inserir dados consolidados
  INSERT INTO origem_leads (competencia, unidade, canal, tipo, quantidade)
  SELECT 
    v_competencia,
    u.nome,
    COALESCE(co.nome, 'Não informado'),
    ld.tipo,
    SUM(ld.quantidade)
  FROM leads_diarios ld
  JOIN unidades u ON u.id = ld.unidade_id
  LEFT JOIN canais_origem co ON co.id = ld.canal_origem_id
  WHERE DATE_TRUNC('month', ld.data) = v_competencia
  GROUP BY u.nome, co.nome, ld.tipo;
  
  GET DIAGNOSTICS v_processados = ROW_COUNT;
  
  RETURN format('Origem leads consolidada: %s registros para %s/%s', v_processados, p_mes, p_ano);
END;
$$ LANGUAGE plpgsql;

-- Comentários
COMMENT ON FUNCTION consolidar_dados_comerciais_mes(INTEGER, INTEGER) IS 
'Recalcula dados_comerciais do zero a partir de leads_diarios. Usar para validação diária ou correção de erros.';

COMMENT ON FUNCTION consolidar_origem_leads_mes(INTEGER, INTEGER) IS 
'Recalcula origem_leads do zero a partir de leads_diarios. Usar para validação diária ou correção de erros.';

-- Validação
DO $$
BEGIN
  RAISE NOTICE '✅ Funções de validação diária criadas com sucesso';
  RAISE NOTICE 'Para executar validação: SELECT consolidar_dados_comerciais_mes(2026, 1);';
END $$;
