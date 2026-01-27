-- =====================================================
-- MIGRAÇÃO: Sincronização Automática movimentacoes_admin
-- Data: 27/01/2026
-- Objetivo: Sincronizar dados do Administrativo com tabelas históricas
-- =====================================================

-- =====================================================
-- 1. FUNÇÃO: Sincronizar Evasões
-- =====================================================
CREATE OR REPLACE FUNCTION sync_evasao_to_historico()
RETURNS TRIGGER AS $$
DECLARE
  v_unidade_nome VARCHAR;
  v_professor_nome VARCHAR;
  v_tipo_evasao_map VARCHAR;
BEGIN
  -- Apenas para INSERT de evasões (tipo='evasao' ou tipo='nao_renovacao')
  IF (TG_OP = 'INSERT' AND NEW.tipo IN ('evasao', 'nao_renovacao')) THEN
    
    -- Buscar nome da unidade
    SELECT nome INTO v_unidade_nome
    FROM unidades
    WHERE id = NEW.unidade_id;
    
    -- Buscar nome do professor (se houver)
    IF NEW.professor_id IS NOT NULL THEN
      SELECT nome INTO v_professor_nome
      FROM professores
      WHERE id = NEW.professor_id;
    END IF;
    
    -- Mapear tipo de evasão
    v_tipo_evasao_map := CASE 
      WHEN NEW.tipo = 'evasao' THEN 'Interrompido'
      WHEN NEW.tipo = 'nao_renovacao' THEN 'Não Renovação'
      ELSE 'Outro'
    END;
    
    -- Inserir na tabela evasoes
    INSERT INTO evasoes (
      competencia,
      unidade,
      aluno,
      professor,
      parcela,
      motivo_categoria,
      motivo_detalhe,
      tipo,
      created_at
    ) VALUES (
      NEW.data,
      COALESCE(v_unidade_nome, 'N/A'),
      NEW.aluno_nome,
      v_professor_nome,
      COALESCE(NEW.valor_parcela_evasao, NEW.valor_parcela_anterior, 0),
      COALESCE(NEW.motivo, 'Não informado'),
      NEW.observacoes,
      v_tipo_evasao_map,
      NOW()
    );
    
    RAISE NOTICE 'Evasão sincronizada: % - % (%)', NEW.aluno_nome, v_tipo_evasao_map, NEW.data;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. FUNÇÃO: Sincronizar Renovações
-- =====================================================
CREATE OR REPLACE FUNCTION sync_renovacao_to_historico()
RETURNS TRIGGER AS $$
DECLARE
  v_percentual_reajuste NUMERIC;
BEGIN
  -- Apenas para INSERT de renovações (tipo='renovacao')
  IF (TG_OP = 'INSERT' AND NEW.tipo = 'renovacao') THEN
    
    -- Calcular percentual de reajuste
    IF NEW.valor_parcela_anterior IS NOT NULL AND NEW.valor_parcela_anterior > 0 THEN
      v_percentual_reajuste := ((NEW.valor_parcela_novo - NEW.valor_parcela_anterior) / NEW.valor_parcela_anterior) * 100;
    ELSE
      v_percentual_reajuste := 0;
    END IF;
    
    -- Inserir na tabela renovacoes
    INSERT INTO renovacoes (
      unidade_id,
      aluno_id,
      data_renovacao,
      status,
      valor_parcela_anterior,
      valor_parcela_novo,
      percentual_reajuste,
      agente,
      observacoes,
      created_at
    ) VALUES (
      NEW.unidade_id,
      NEW.aluno_id,
      NEW.data,
      'realizada',
      NEW.valor_parcela_anterior,
      NEW.valor_parcela_novo,
      v_percentual_reajuste,
      NEW.agente_comercial,
      NEW.observacoes,
      NOW()
    );
    
    RAISE NOTICE 'Renovação sincronizada: % - Reajuste: %', NEW.aluno_nome, v_percentual_reajuste;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. CRIAR TRIGGERS
-- =====================================================

-- Trigger para sincronizar evasões
DROP TRIGGER IF EXISTS tr_sync_evasao ON movimentacoes_admin;
CREATE TRIGGER tr_sync_evasao
  AFTER INSERT ON movimentacoes_admin
  FOR EACH ROW
  EXECUTE FUNCTION sync_evasao_to_historico();

-- Trigger para sincronizar renovações
DROP TRIGGER IF EXISTS tr_sync_renovacao ON movimentacoes_admin;
CREATE TRIGGER tr_sync_renovacao
  AFTER INSERT ON movimentacoes_admin
  FOR EACH ROW
  EXECUTE FUNCTION sync_renovacao_to_historico();

-- =====================================================
-- 4. COMENTÁRIOS E DOCUMENTAÇÃO
-- =====================================================

COMMENT ON FUNCTION sync_evasao_to_historico() IS 
'Sincroniza automaticamente evasões e não renovações de movimentacoes_admin para a tabela evasoes';

COMMENT ON FUNCTION sync_renovacao_to_historico() IS 
'Sincroniza automaticamente renovações de movimentacoes_admin para a tabela renovacoes';

COMMENT ON TRIGGER tr_sync_evasao ON movimentacoes_admin IS 
'Trigger que sincroniza evasões do Administrativo para o histórico';

COMMENT ON TRIGGER tr_sync_renovacao ON movimentacoes_admin IS 
'Trigger que sincroniza renovações do Administrativo para o histórico';

-- =====================================================
-- 5. TESTES DE VALIDAÇÃO
-- =====================================================

-- Teste 1: Verificar se triggers foram criados
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname IN ('tr_sync_evasao', 'tr_sync_renovacao')
  ) THEN
    RAISE NOTICE '✅ Triggers criados com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Falha ao criar triggers';
  END IF;
END $$;

-- Teste 2: Verificar se funções foram criadas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname IN ('sync_evasao_to_historico', 'sync_renovacao_to_historico')
  ) THEN
    RAISE NOTICE '✅ Funções criadas com sucesso';
  ELSE
    RAISE EXCEPTION '❌ Falha ao criar funções';
  END IF;
END $$;

RAISE NOTICE '========================================';
RAISE NOTICE '✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO';
RAISE NOTICE '========================================';
RAISE NOTICE 'Próximos passos:';
RAISE NOTICE '1. Testar inserindo dados no Administrativo';
RAISE NOTICE '2. Verificar se dados aparecem em evasoes/renovacoes';
RAISE NOTICE '3. Validar comparativos no Analytics';
RAISE NOTICE '========================================';
