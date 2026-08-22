-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrigir status de 'realizada' para 'renovado'
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
      'renovado',  -- CORRIGIDO: era 'realizada', agora 'renovado'
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
