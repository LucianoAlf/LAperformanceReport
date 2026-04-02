-- Tabela de contatos do aluno (múltiplos telefones)
CREATE TABLE aluno_contatos (
  id SERIAL PRIMARY KEY,
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  nome VARCHAR(200) NOT NULL,
  telefone VARCHAR(20),
  parentesco VARCHAR(50), -- 'proprio', 'mae', 'pai', 'responsavel', 'outro'
  principal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_aluno_contatos_aluno_id ON aluno_contatos(aluno_id);
CREATE INDEX idx_aluno_contatos_telefone ON aluno_contatos(telefone);

-- RLS
ALTER TABLE aluno_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aluno_contatos_select" ON aluno_contatos FOR SELECT USING (true);
CREATE POLICY "aluno_contatos_insert" ON aluno_contatos FOR INSERT WITH CHECK (true);
CREATE POLICY "aluno_contatos_update" ON aluno_contatos FOR UPDATE USING (true);
CREATE POLICY "aluno_contatos_delete" ON aluno_contatos FOR DELETE USING (true);

-- Migrar dados existentes: telefone do aluno → contato principal
INSERT INTO aluno_contatos (aluno_id, nome, telefone, parentesco, principal)
SELECT
  a.id,
  a.nome,
  COALESCE(a.whatsapp, a.telefone),
  'proprio',
  true
FROM alunos a
WHERE COALESCE(a.whatsapp, a.telefone) IS NOT NULL
  AND TRIM(COALESCE(a.whatsapp, a.telefone)) != '';

-- Migrar responsavel → contato secundário (quando diferente do principal)
INSERT INTO aluno_contatos (aluno_id, nome, telefone, parentesco, principal)
SELECT
  a.id,
  COALESCE(NULLIF(TRIM(a.responsavel_nome), ''), 'Responsável'),
  a.responsavel_telefone,
  COALESCE(NULLIF(TRIM(a.responsavel_parentesco), ''), 'responsavel'),
  false
FROM alunos a
WHERE a.responsavel_telefone IS NOT NULL
  AND TRIM(a.responsavel_telefone) != ''
  AND (
    COALESCE(a.whatsapp, a.telefone) IS NULL
    OR a.responsavel_telefone != COALESCE(a.whatsapp, a.telefone)
  );

-- Trigger que sincroniza aluno_contatos quando campos legados mudam
CREATE OR REPLACE FUNCTION sync_aluno_contatos_from_legacy()
RETURNS TRIGGER AS $$
DECLARE
  tel_principal TEXT;
  contato_exists BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' OR
     OLD.telefone IS DISTINCT FROM NEW.telefone OR
     OLD.whatsapp IS DISTINCT FROM NEW.whatsapp OR
     OLD.responsavel_telefone IS DISTINCT FROM NEW.responsavel_telefone OR
     OLD.responsavel_nome IS DISTINCT FROM NEW.responsavel_nome THEN

    tel_principal := COALESCE(NULLIF(TRIM(NEW.whatsapp), ''), NULLIF(TRIM(NEW.telefone), ''));

    IF tel_principal IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM aluno_contatos
        WHERE aluno_id = NEW.id AND principal = true
      ) INTO contato_exists;

      IF NOT contato_exists THEN
        INSERT INTO aluno_contatos (aluno_id, nome, telefone, parentesco, principal)
        VALUES (NEW.id, NEW.nome, tel_principal, 'proprio', true);
      END IF;
    END IF;

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
