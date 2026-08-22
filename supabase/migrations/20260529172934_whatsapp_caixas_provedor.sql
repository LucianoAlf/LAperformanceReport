-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


ALTER TABLE whatsapp_caixas
  ADD COLUMN IF NOT EXISTS provedor TEXT NOT NULL DEFAULT 'uazapi',
  ADD COLUMN IF NOT EXISTS waha_url TEXT,
  ADD COLUMN IF NOT EXISTS waha_session TEXT;

COMMENT ON COLUMN whatsapp_caixas.provedor IS 'Provedor WhatsApp: uazapi | waha';
COMMENT ON COLUMN whatsapp_caixas.waha_url IS 'URL base da instância WAHA (ex: https://waha.lamusic.com.br)';
COMMENT ON COLUMN whatsapp_caixas.waha_session IS 'Nome da sessão WAHA (ex: 5_198_552139554415)';
