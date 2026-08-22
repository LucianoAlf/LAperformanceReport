-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION calcular_comissao_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_comissao_percentual NUMERIC;
  v_valor_comissao NUMERIC;
  v_carteira_id INTEGER;
  v_saldo_atual NUMERIC;
BEGIN
  -- Só processa se a venda tem vendedor (vendedor_id)
  IF NEW.vendedor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar percentual de comissão das configurações (global, sem filtro por unidade)
  SELECT COALESCE(
    (SELECT valor::NUMERIC FROM loja_configuracoes WHERE chave = 'comissao_farmer_venda' LIMIT 1),
    5.0 -- Padrão 5%
  ) INTO v_comissao_percentual;

  -- Calcular valor da comissão
  v_valor_comissao := (NEW.total * v_comissao_percentual) / 100;

  -- Buscar ou criar carteira do colaborador
  SELECT id, saldo INTO v_carteira_id, v_saldo_atual
  FROM loja_carteira
  WHERE colaborador_id = NEW.vendedor_id AND tipo_titular = 'farmer'
  LIMIT 1;

  IF v_carteira_id IS NULL THEN
    -- Criar carteira
    INSERT INTO loja_carteira (tipo_titular, colaborador_id, unidade_id, saldo, moedas_la)
    VALUES ('farmer', NEW.vendedor_id, NEW.unidade_id, 0, 0)
    RETURNING id, saldo INTO v_carteira_id, v_saldo_atual;
  END IF;

  -- Atualizar saldo da carteira
  UPDATE loja_carteira
  SET saldo = saldo + v_valor_comissao,
      updated_at = NOW()
  WHERE id = v_carteira_id;

  -- Registrar movimentação com colunas corretas
  INSERT INTO loja_carteira_movimentacoes (carteira_id, tipo, valor, saldo_apos, referencia_tipo, referencia_id, descricao, created_at)
  VALUES (v_carteira_id, 'comissao_venda', v_valor_comissao, v_saldo_atual + v_valor_comissao, 'venda', NEW.id, 'Comissão de venda #' || NEW.id, NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
