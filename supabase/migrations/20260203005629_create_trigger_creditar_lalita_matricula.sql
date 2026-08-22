-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Função para creditar Lalita ao professor quando matrícula é convertida
-- A Lalita é creditada quando um professor indica um aluno que se matricula
CREATE OR REPLACE FUNCTION creditar_lalita_matricula()
RETURNS TRIGGER AS $$
DECLARE
  v_valor_lalita NUMERIC;
  v_carteira_id INTEGER;
  v_professor_id INTEGER;
BEGIN
  -- Só processa se tem professor indicador
  IF NEW.professor_indicador_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_professor_id := NEW.professor_indicador_id;

  -- Buscar valor da Lalita nas configurações
  SELECT COALESCE(
    (SELECT valor::NUMERIC FROM loja_configuracoes WHERE chave = 'valor_moeda_la' LIMIT 1),
    30.0 -- Padrão R$ 30
  ) INTO v_valor_lalita;

  -- Buscar ou criar carteira do professor
  SELECT id INTO v_carteira_id
  FROM loja_carteira
  WHERE professor_id = v_professor_id AND tipo_titular = 'professor'
  LIMIT 1;

  IF v_carteira_id IS NULL THEN
    -- Criar carteira
    INSERT INTO loja_carteira (tipo_titular, professor_id, unidade_id, saldo, moedas_la)
    VALUES ('professor', v_professor_id, NEW.unidade_id, 0, 0)
    RETURNING id INTO v_carteira_id;
  END IF;

  -- Atualizar carteira: +1 Lalita e +valor em saldo
  UPDATE loja_carteira
  SET moedas_la = moedas_la + 1,
      saldo = saldo + v_valor_lalita,
      updated_at = NOW()
  WHERE id = v_carteira_id;

  -- Registrar movimentação
  INSERT INTO loja_carteira_movimentacoes (carteira_id, tipo, valor, referencia, created_at)
  VALUES (v_carteira_id, 'lalita', v_valor_lalita, 'Matrícula ' || COALESCE(NEW.aluno_nome, '#' || NEW.id), NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Nota: Este trigger deve ser aplicado na tabela de matrículas quando ela existir
-- Por enquanto, criamos apenas a função para uso futuro
-- DROP TRIGGER IF EXISTS trigger_creditar_lalita_matricula ON matriculas;
-- CREATE TRIGGER trigger_creditar_lalita_matricula
--   AFTER INSERT ON matriculas
--   FOR EACH ROW
--   WHEN (NEW.status = 'ativa' AND NEW.professor_indicador_id IS NOT NULL)
--   EXECUTE FUNCTION creditar_lalita_matricula();
