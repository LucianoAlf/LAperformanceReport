-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

UPDATE storage.buckets 
SET allowed_mime_types = array_cat(allowed_mime_types, ARRAY['audio/webm', 'audio/webm;codecs=opus'])
WHERE name = 'crm-midia';
