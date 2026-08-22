-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Costura: quando um número é cadastrado/atualizado num aluno, vincula automaticamente
-- conversas soltas (admin_conversas externas) que carregam aquele número.
-- Só PREENCHE o dono (aluno_id) — nunca apaga, desvincula nem troca o aluno de uma conversa.
CREATE OR REPLACE FUNCTION fn_costura_vincular_conversa_numero()
RETURNS trigger AS $$
DECLARE
  v_num text;
  v_suffix text;
BEGIN
  FOREACH v_num IN ARRAY ARRAY[NEW.telefone, NEW.whatsapp] LOOP
    IF v_num IS NULL THEN CONTINUE; END IF;
    v_suffix := right(regexp_replace(v_num, '\D', '', 'g'), 11);
    IF length(v_suffix) < 10 THEN CONTINUE; END IF;

    UPDATE admin_conversas c
    SET aluno_id = NEW.id,
        unidade_id = COALESCE(c.unidade_id, NEW.unidade_id),
        updated_at = now()
    WHERE c.aluno_id IS NULL
      AND right(regexp_replace(COALESCE(c.telefone_externo, c.whatsapp_jid, ''), '\D', '', 'g'), 11) = v_suffix
      -- segurança: não vincular se o aluno já tem conversa com esse número no mesmo departamento
      AND NOT EXISTS (
        SELECT 1 FROM admin_conversas c2
        WHERE c2.aluno_id = NEW.id
          AND c2.departamento = c.departamento
          AND right(regexp_replace(COALESCE(c2.whatsapp_jid, c2.telefone_externo, ''), '\D', '', 'g'), 11) = v_suffix
      );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_costura_vincular_conversa ON alunos;
CREATE TRIGGER trg_costura_vincular_conversa
AFTER INSERT OR UPDATE OF telefone, whatsapp ON alunos
FOR EACH ROW
EXECUTE FUNCTION fn_costura_vincular_conversa_numero();
