-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Corrigir função: mover DECLARE para o topo (PL/pgSQL não permite DECLARE dentro de IF)
CREATE OR REPLACE FUNCTION sync_movimentacoes_admin_to_tables()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo_saida_id INTEGER;
BEGIN
  -- ===== EVASÃO ou NÃO RENOVAÇÃO → evasoes_v2 =====
  IF NEW.tipo IN ('evasao', 'nao_renovacao') AND NEW.aluno_id IS NOT NULL THEN
    -- Determinar tipo_saida_id: 1=Interrompido, 2=Não Renovou
    IF NEW.tipo = 'nao_renovacao' THEN
      v_tipo_saida_id := 2;
    ELSIF NEW.tipo_evasao = 'nao_renovou' THEN
      v_tipo_saida_id := 2;
    ELSE
      v_tipo_saida_id := 1;
    END IF;

    -- Inserir em evasoes_v2 (sem ON CONFLICT pois não há unique constraint)
    -- Verificar se já existe registro para este aluno/unidade/data
    IF NOT EXISTS (
      SELECT 1 FROM evasoes_v2 
      WHERE aluno_id = NEW.aluno_id 
        AND unidade_id = NEW.unidade_id 
        AND data_evasao = NEW.data
    ) THEN
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
      );
    END IF;
  END IF;

  -- ===== RENOVAÇÃO → renovacoes =====
  IF NEW.tipo = 'renovacao' AND NEW.aluno_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM renovacoes 
      WHERE aluno_id = NEW.aluno_id 
        AND unidade_id = NEW.unidade_id 
        AND data_renovacao = NEW.data
    ) THEN
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
      );
    END IF;
  END IF;

  -- ===== NÃO RENOVAÇÃO → renovacoes (como nao_renovado) =====
  IF NEW.tipo = 'nao_renovacao' AND NEW.aluno_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM renovacoes 
      WHERE aluno_id = NEW.aluno_id 
        AND unidade_id = NEW.unidade_id 
        AND data_renovacao = NEW.data
        AND status = 'nao_renovado'
    ) THEN
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
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
