-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Trigger para sincronizar evasões de movimentacoes_admin para evasoes_v2
CREATE OR REPLACE FUNCTION sync_evasao_to_evasoes_v2()
RETURNS TRIGGER AS $$
BEGIN
  -- Apenas para INSERT de evasões (tipo='evasao' ou tipo='nao_renovacao')
  IF (TG_OP = 'INSERT' AND NEW.tipo IN ('evasao', 'nao_renovacao')) THEN
    
    INSERT INTO evasoes_v2 (
      unidade_id,
      data_evasao,
      aluno_id,
      professor_id,
      valor_parcela,
      tipo_saida_id,
      motivo_saida_id,
      observacoes,
      created_at
    ) VALUES (
      NEW.unidade_id,
      NEW.data,
      NEW.aluno_id,
      NEW.professor_id,
      COALESCE(NEW.valor_parcela_evasao, NEW.valor_parcela_anterior, 0),
      CASE 
        WHEN NEW.tipo = 'evasao' THEN 1  -- Interrompido
        WHEN NEW.tipo = 'nao_renovacao' THEN 2  -- Não Renovação
        ELSE 1
      END,
      NEW.motivo_saida_id,
      NEW.observacoes,
      NOW()
    );
    
    RAISE NOTICE 'Evasão sincronizada para evasoes_v2: % - %', NEW.aluno_nome, NEW.data;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger (se não existir)
DROP TRIGGER IF EXISTS tr_sync_evasao_v2 ON movimentacoes_admin;
CREATE TRIGGER tr_sync_evasao_v2
  AFTER INSERT ON movimentacoes_admin
  FOR EACH ROW
  EXECUTE FUNCTION sync_evasao_to_evasoes_v2();
