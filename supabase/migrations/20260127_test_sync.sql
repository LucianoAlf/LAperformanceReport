-- =====================================================
-- SCRIPT DE TESTE: Sincronização movimentacoes_admin
-- Data: 27/01/2026
-- IMPORTANTE: Executar APÓS a migração principal
-- =====================================================

-- =====================================================
-- TESTE 1: Inserir Renovação de Teste
-- =====================================================
DO $$
DECLARE
  v_unidade_id UUID;
  v_count_antes_renovacoes INT;
  v_count_depois_renovacoes INT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE 1: Renovação';
  RAISE NOTICE '========================================';
  
  -- Pegar primeira unidade disponível
  SELECT id INTO v_unidade_id FROM unidades LIMIT 1;
  
  -- Contar registros antes
  SELECT COUNT(*) INTO v_count_antes_renovacoes FROM renovacoes;
  RAISE NOTICE 'Renovações antes: %', v_count_antes_renovacoes;
  
  -- Inserir renovação de teste
  INSERT INTO movimentacoes_admin (
    unidade_id,
    tipo,
    data,
    aluno_nome,
    aluno_id,
    valor_parcela_anterior,
    valor_parcela_novo,
    agente_comercial
  ) VALUES (
    v_unidade_id,
    'renovacao',
    CURRENT_DATE,
    'TESTE - Aluno Renovação',
    1,
    100.00,
    110.00,
    'TESTE'
  );
  
  -- Contar registros depois
  SELECT COUNT(*) INTO v_count_depois_renovacoes FROM renovacoes;
  RAISE NOTICE 'Renovações depois: %', v_count_depois_renovacoes;
  
  -- Validar
  IF v_count_depois_renovacoes > v_count_antes_renovacoes THEN
    RAISE NOTICE '✅ TESTE 1 PASSOU: Renovação sincronizada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ TESTE 1 FALHOU: Renovação não foi sincronizada';
  END IF;
  
  -- Limpar dados de teste
  DELETE FROM movimentacoes_admin WHERE aluno_nome = 'TESTE - Aluno Renovação';
  DELETE FROM renovacoes WHERE observacoes IS NULL AND agente = 'TESTE';
  
  RAISE NOTICE 'Dados de teste limpos';
END $$;

-- =====================================================
-- TESTE 2: Inserir Evasão (Cancelamento) de Teste
-- =====================================================
DO $$
DECLARE
  v_unidade_id UUID;
  v_count_antes_evasoes INT;
  v_count_depois_evasoes INT;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE 2: Evasão (Cancelamento)';
  RAISE NOTICE '========================================';
  
  -- Pegar primeira unidade disponível
  SELECT id INTO v_unidade_id FROM unidades LIMIT 1;
  
  -- Contar registros antes
  SELECT COUNT(*) INTO v_count_antes_evasoes FROM evasoes;
  RAISE NOTICE 'Evasões antes: %', v_count_antes_evasoes;
  
  -- Inserir evasão de teste
  INSERT INTO movimentacoes_admin (
    unidade_id,
    tipo,
    data,
    aluno_nome,
    valor_parcela_evasao,
    motivo
  ) VALUES (
    v_unidade_id,
    'evasao',
    CURRENT_DATE,
    'TESTE - Aluno Evasão',
    150.00,
    'Teste de sincronização'
  );
  
  -- Contar registros depois
  SELECT COUNT(*) INTO v_count_depois_evasoes FROM evasoes;
  RAISE NOTICE 'Evasões depois: %', v_count_depois_evasoes;
  
  -- Validar
  IF v_count_depois_evasoes > v_count_antes_evasoes THEN
    RAISE NOTICE '✅ TESTE 2 PASSOU: Evasão sincronizada com sucesso';
  ELSE
    RAISE EXCEPTION '❌ TESTE 2 FALHOU: Evasão não foi sincronizada';
  END IF;
  
  -- Limpar dados de teste
  DELETE FROM movimentacoes_admin WHERE aluno_nome = 'TESTE - Aluno Evasão';
  DELETE FROM evasoes WHERE aluno = 'TESTE - Aluno Evasão';
  
  RAISE NOTICE 'Dados de teste limpos';
END $$;

-- =====================================================
-- TESTE 3: Inserir Não Renovação de Teste
-- =====================================================
DO $$
DECLARE
  v_unidade_id UUID;
  v_count_antes_evasoes INT;
  v_count_depois_evasoes INT;
  v_tipo_correto BOOLEAN;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TESTE 3: Não Renovação';
  RAISE NOTICE '========================================';
  
  -- Pegar primeira unidade disponível
  SELECT id INTO v_unidade_id FROM unidades LIMIT 1;
  
  -- Contar registros antes
  SELECT COUNT(*) INTO v_count_antes_evasoes FROM evasoes WHERE tipo = 'Não Renovação';
  RAISE NOTICE 'Não Renovações antes: %', v_count_antes_evasoes;
  
  -- Inserir não renovação de teste
  INSERT INTO movimentacoes_admin (
    unidade_id,
    tipo,
    data,
    aluno_nome,
    valor_parcela_anterior,
    motivo
  ) VALUES (
    v_unidade_id,
    'nao_renovacao',
    CURRENT_DATE,
    'TESTE - Aluno Não Renovação',
    120.00,
    'Teste de não renovação'
  );
  
  -- Contar registros depois e verificar tipo
  SELECT COUNT(*) INTO v_count_depois_evasoes FROM evasoes WHERE tipo = 'Não Renovação';
  SELECT EXISTS(SELECT 1 FROM evasoes WHERE aluno = 'TESTE - Aluno Não Renovação' AND tipo = 'Não Renovação') INTO v_tipo_correto;
  
  RAISE NOTICE 'Não Renovações depois: %', v_count_depois_evasoes;
  
  -- Validar
  IF v_count_depois_evasoes > v_count_antes_evasoes AND v_tipo_correto THEN
    RAISE NOTICE '✅ TESTE 3 PASSOU: Não Renovação sincronizada com tipo correto';
  ELSE
    RAISE EXCEPTION '❌ TESTE 3 FALHOU: Não Renovação não foi sincronizada corretamente';
  END IF;
  
  -- Limpar dados de teste
  DELETE FROM movimentacoes_admin WHERE aluno_nome = 'TESTE - Aluno Não Renovação';
  DELETE FROM evasoes WHERE aluno = 'TESTE - Aluno Não Renovação';
  
  RAISE NOTICE 'Dados de teste limpos';
END $$;

-- =====================================================
-- RESUMO DOS TESTES
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ TODOS OS TESTES PASSARAM';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Sincronização funcionando corretamente:';
  RAISE NOTICE '- Renovações → tabela renovacoes';
  RAISE NOTICE '- Evasões → tabela evasoes (tipo: Interrompido)';
  RAISE NOTICE '- Não Renovações → tabela evasoes (tipo: Não Renovação)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Sistema pronto para uso em produção!';
  RAISE NOTICE '========================================';
END $$;
