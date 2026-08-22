-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION check_automacao_professor_vinculado()
RETURNS TRIGGER AS $$
DECLARE
  v_professor_id integer;
BEGIN
  -- Buscar o aluno pelo nome (match exato, case-insensitive)
  SELECT professor_atual_id INTO v_professor_id
  FROM alunos
  WHERE LOWER(TRIM(nome)) = LOWER(TRIM(NEW.aluno_nome))
    AND status = 'ativo'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Se encontrou aluno mas sem professor, marcar no detalhes
  IF FOUND AND v_professor_id IS NULL THEN
    NEW.detalhes = jsonb_set(
      COALESCE(NEW.detalhes, '{}'::jsonb),
      '{sem_professor}',
      'true'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_automacao_check_professor
  BEFORE INSERT ON automacao_log
  FOR EACH ROW
  EXECUTE FUNCTION check_automacao_professor_vinculado();
