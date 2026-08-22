-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Trigger para sincronizar movimentacoes_admin → evasoes_v2 e renovacoes
-- Garante que lançamentos do Administrativo alimentem as tabelas que as views usam

CREATE OR REPLACE FUNCTION sync_movimentacoes_admin_to_tables()
RETURNS TRIGGER AS $$
BEGIN
  -- ===== EVASÃO ou NÃO RENOVAÇÃO → evasoes_v2 =====
  IF NEW.tipo IN ('evasao', 'nao_renovacao') AND NEW.aluno_id IS NOT NULL THEN
    -- Determinar tipo_saida_id: 1=Interrompido, 2=Não Renovou
    -- tipo_evasao pode ser 'interrompido', 'nao_renovou', ou NULL
    DECLARE
      v_tipo_saida_id INTEGER;
    BEGIN
      IF NEW.tipo = 'nao_renovacao' THEN
        v_tipo_saida_id := 2; -- Não Renovou
      ELSIF NEW.tipo_evasao = 'nao_renovou' THEN
        v_tipo_saida_id := 2; -- Não Renovou
      ELSE
        v_tipo_saida_id := 1; -- Interrompido (padrão para evasão)
      END IF;

      -- Inserir em evasoes_v2 se não existir registro para este aluno/unidade/mês
      INSERT INTO evasoes_v2 (aluno_id, unidade_id, data_evasao, tipo_saida_id, motivo_saida_id, professor_id, valor_parcela, observacoes, curso_id)
      VALUES (
        NEW.aluno_id,
        NEW.unidade_id,
        NEW.data,
        v_tipo_saida_id,
        NEW.motivo_saida_id,
        NEW.professor_id,
        COALESCE(NEW.valor_parcela_evasao, NEW.valor_parcela_anterior),
        NEW.observacoes,
        NEW.curso_id
      )
      ON CONFLICT DO NOTHING; -- Evitar duplicatas se já existir
    END;
  END IF;

  -- ===== RENOVAÇÃO → renovacoes =====
  IF NEW.tipo = 'renovacao' AND NEW.aluno_id IS NOT NULL THEN
    -- Inserir em renovacoes
    INSERT INTO renovacoes (aluno_id, unidade_id, data_renovacao, valor_parcela_anterior, valor_parcela_novo, percentual_reajuste, status, professor_id, observacoes, agente)
    VALUES (
      NEW.aluno_id,
      NEW.unidade_id,
      NEW.data,
      NEW.valor_parcela_anterior,
      NEW.valor_parcela_novo,
      CASE 
        WHEN COALESCE(NEW.valor_parcela_anterior, 0) > 0 
        THEN ROUND(((COALESCE(NEW.valor_parcela_novo, 0) - NEW.valor_parcela_anterior) / NEW.valor_parcela_anterior * 100)::NUMERIC, 2)
        ELSE 0 
      END,
      'renovado',
      NEW.professor_id,
      NEW.observacoes,
      NEW.agente_comercial
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- ===== NÃO RENOVAÇÃO → renovacoes (como nao_renovado) =====
  IF NEW.tipo = 'nao_renovacao' AND NEW.aluno_id IS NOT NULL THEN
    INSERT INTO renovacoes (aluno_id, unidade_id, data_renovacao, valor_parcela_anterior, status, professor_id, observacoes, agente)
    VALUES (
      NEW.aluno_id,
      NEW.unidade_id,
      NEW.data,
      COALESCE(NEW.valor_parcela_evasao, NEW.valor_parcela_anterior),
      'nao_renovado',
      NEW.professor_id,
      NEW.observacoes,
      NEW.agente_comercial
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger AFTER INSERT (não precisa para UPDATE/DELETE por enquanto)
DROP TRIGGER IF EXISTS trg_sync_movimentacoes_admin ON movimentacoes_admin;
CREATE TRIGGER trg_sync_movimentacoes_admin
  AFTER INSERT ON movimentacoes_admin
  FOR EACH ROW
  EXECUTE FUNCTION sync_movimentacoes_admin_to_tables();
