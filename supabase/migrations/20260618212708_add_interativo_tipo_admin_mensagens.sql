-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT constraint_name INTO v_constraint_name
  FROM information_schema.table_constraints
  WHERE table_name = 'admin_mensagens'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%tipo%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE admin_mensagens DROP CONSTRAINT ' || quote_ident(v_constraint_name);
  END IF;
END $$;

ALTER TABLE admin_mensagens
  ADD CONSTRAINT admin_mensagens_tipo_check
  CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'sticker', 'sistema', 'interativo'));
