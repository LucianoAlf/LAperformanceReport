-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.


ALTER TABLE leads 
ADD COLUMN chatwoot_conversation_id BIGINT UNIQUE;

CREATE INDEX idx_leads_chatwoot_conversation_id 
ON leads(chatwoot_conversation_id);
