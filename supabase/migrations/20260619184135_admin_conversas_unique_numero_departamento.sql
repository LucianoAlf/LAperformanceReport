-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


-- Rede de segurança: no máximo 1 conversa por número + departamento (evita duplicar/misturar).
-- Parcial: conversas sem número (whatsapp_jid NULL) não entram na trava.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_conversas_jid_depto
ON admin_conversas (whatsapp_jid, departamento)
WHERE whatsapp_jid IS NOT NULL;
