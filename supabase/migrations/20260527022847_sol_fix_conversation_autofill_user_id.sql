-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


CREATE OR REPLACE FUNCTION public.fn_bi_conversation_autofill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.user_id := auth.uid();

  SELECT c.id, c.unidade_id, c.tipo
  INTO   NEW.colaborador_id, NEW.unidade_id, NEW.colaborador_tipo
  FROM   public.colaboradores c
  WHERE  c.usuario_id = auth.uid()
    AND  c.ativo = true
  ORDER BY c.created_at ASC
  LIMIT 1;

  RETURN NEW;
END;
$$;
