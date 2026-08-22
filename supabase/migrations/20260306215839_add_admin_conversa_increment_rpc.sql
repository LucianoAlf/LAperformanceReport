-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

CREATE OR REPLACE FUNCTION admin_conversa_nova_mensagem(
  p_conversa_id UUID,
  p_preview TEXT DEFAULT NULL,
  p_whatsapp_jid TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE admin_conversas
  SET
    nao_lidas = nao_lidas + 1,
    ultima_mensagem_at = now(),
    ultima_mensagem_preview = COALESCE(p_preview, ultima_mensagem_preview),
    whatsapp_jid = COALESCE(p_whatsapp_jid, whatsapp_jid),
    updated_at = now()
  WHERE id = p_conversa_id;
END;
$$;
