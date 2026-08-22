-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Trigger que sincroniza aluno_contatos quando campos legados mudam
CREATE OR REPLACE FUNCTION sync_aluno_contatos_from_legacy()
RETURNS TRIGGER AS $$
DECLARE
  tel_principal TEXT;
  contato_exists BOOLEAN;
BEGIN
  -- Só rodar quando telefone ou responsavel_telefone mudam
  IF TG_OP = 'INSERT' OR 
     OLD.telefone IS DISTINCT FROM NEW.telefone OR
     OLD.whatsapp IS DISTINCT FROM NEW.whatsapp OR
     OLD.responsavel_telefone IS DISTINCT FROM NEW.responsavel_telefone OR
     OLD.responsavel_nome IS DISTINCT FROM NEW.responsavel_nome THEN

    -- Telefone principal do aluno (whatsapp > telefone)
    tel_principal := COALESCE(NULLIF(TRIM(NEW.whatsapp), ''), NULLIF(TRIM(NEW.telefone), ''));
    
    IF tel_principal IS NOT NULL THEN
      -- Verificar se já existe contato principal
      SELECT EXISTS(
        SELECT 1 FROM aluno_contatos 
        WHERE aluno_id = NEW.id AND principal = true
      ) INTO contato_exists;
      
      IF NOT contato_exists THEN
        INSERT INTO aluno_contatos (aluno_id, nome, telefone, parentesco, principal)
        VALUES (NEW.id, NEW.nome, tel_principal, 'proprio', true);
      END IF;
    END IF;

    -- Responsável
    IF NULLIF(TRIM(NEW.responsavel_telefone), '') IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM aluno_contatos 
        WHERE aluno_id = NEW.id AND principal = false 
          AND telefone = TRIM(NEW.responsavel_telefone)
      ) INTO contato_exists;
      
      IF NOT contato_exists THEN
        INSERT INTO aluno_contatos (aluno_id, nome, telefone, parentesco, principal)
        VALUES (
          NEW.id,
          COALESCE(NULLIF(TRIM(NEW.responsavel_nome), ''), 'Responsável'),
          TRIM(NEW.responsavel_telefone),
          COALESCE(NULLIF(TRIM(NEW.responsavel_parentesco), ''), 'responsavel'),
          false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_aluno_contatos
AFTER INSERT OR UPDATE OF telefone, whatsapp, responsavel_telefone, responsavel_nome
ON alunos
FOR EACH ROW
EXECUTE FUNCTION sync_aluno_contatos_from_legacy();
