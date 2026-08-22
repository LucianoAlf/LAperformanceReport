-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION fn_aluno_ativo_sem_data_saida()
RETURNS TRIGGER AS $$
BEGIN
  -- Invariante: aluno ativo/trancado nao pode carregar data de saida.
  -- Zera residuo de evasao anterior quando o aluno volta a ativo/trancado
  -- (rematricula/renovacao via Emusys nao limpam data_saida hoje).
  NEW.data_saida := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aluno_ativo_sem_data_saida ON alunos;
CREATE TRIGGER trg_aluno_ativo_sem_data_saida
BEFORE INSERT OR UPDATE ON alunos
FOR EACH ROW
WHEN (NEW.status IN ('ativo','trancado') AND NEW.data_saida IS NOT NULL)
EXECUTE FUNCTION fn_aluno_ativo_sem_data_saida();
